#include "classic_server.hpp"
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <chrono>

namespace pulsechat {

ClassicServer::ClassicServer(uint16_t port)
    : port_(port) {}

ClassicServer::~ClassicServer() {
    stop();
}

bool ClassicServer::start() {
    if (running_.load()) return false;

    listen_fd_ = ::socket(AF_INET, SOCK_STREAM, 0);
    if (listen_fd_ < 0) {
        LOG_ERROR("ClassicServer: Failed to create socket");
        return false;
    }

    net::set_reuseaddr(listen_fd_);
    net::set_tcp_nodelay(listen_fd_);

    sockaddr_in server_addr{};
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(port_);

    if (::bind(listen_fd_, reinterpret_cast<sockaddr*>(&server_addr), sizeof(server_addr)) < 0) {
        LOG_ERROR("ClassicServer: Failed to bind to port " << port_);
        ::close(listen_fd_);
        listen_fd_ = -1;
        return false;
    }

    if (::listen(listen_fd_, SOMAXCONN) < 0) {
        LOG_ERROR("ClassicServer: Failed to listen on socket");
        ::close(listen_fd_);
        listen_fd_ = -1;
        return false;
    }

    running_.store(true);
    LOG_INFO("ClassicServer (Thread-per-Client) listening on port " << port_);

    listener_thread_ = std::thread(&ClassicServer::accept_loop, this);
    reaper_thread_ = std::thread(&ClassicServer::heartbeat_reaper_loop, this);
    metrics_thread_ = std::thread(&ClassicServer::metrics_reporter_loop, this);

    return true;
}

void ClassicServer::stop() {
    if (!running_.exchange(false)) return;

    LOG_INFO("ClassicServer: Shutting down...");

    if (listen_fd_ >= 0) {
        ::shutdown(listen_fd_, SHUT_RDWR);
        ::close(listen_fd_);
        listen_fd_ = -1;
    }

    // Close all connected clients
    {
        std::lock_guard<std::mutex> lock(clients_mutex_);
        for (auto& [fd, ctx] : clients_) {
            ::shutdown(fd, SHUT_RDWR);
            ::close(fd);
        }
        clients_.clear();
    }

    if (listener_thread_.joinable()) listener_thread_.join();
    if (reaper_thread_.joinable()) reaper_thread_.join();
    if (metrics_thread_.joinable()) metrics_thread_.join();

    // Join all worker threads
    for (auto& t : worker_threads_) {
        if (t.joinable()) {
            t.join();
        }
    }
    worker_threads_.clear();

    LOG_INFO("ClassicServer: Shutdown complete.");
}

void ClassicServer::wait_until_stopped() {
    if (listener_thread_.joinable()) {
        listener_thread_.join();
    }
}

void ClassicServer::accept_loop() {
    while (running_.load()) {
        sockaddr_in client_addr{};
        socklen_t addr_len = sizeof(client_addr);
        int client_fd = ::accept(listen_fd_, reinterpret_cast<sockaddr*>(&client_addr), &addr_len);

        if (client_fd < 0) {
            if (running_.load()) {
                LOG_WARN("ClassicServer: accept() failed: " << std::strerror(errno));
            }
            break;
        }

        net::set_tcp_nodelay(client_fd);
        std::string peer_ip = net::get_peer_ip(client_fd);
        LOG_INFO("New incoming connection from " << peer_ip << " (fd=" << client_fd << ")");

        auto ctx = std::make_shared<ClassicClientContext>(client_fd, peer_ip);
        {
            std::lock_guard<std::mutex> lock(clients_mutex_);
            clients_[client_fd] = ctx;
        }

        Metrics::instance().record_connection_opened();

        // Spawn a dedicated thread per client
        worker_threads_.emplace_back(&ClassicServer::client_handler, this, client_fd);
    }
}

void ClassicServer::client_handler(int client_fd) {
    ByteBuffer read_buf(4096);
    char temp_buf[READ_BUFFER_SIZE];

    while (running_.load()) {
        ssize_t bytes_read = ::recv(client_fd, temp_buf, sizeof(temp_buf), 0);

        if (bytes_read > 0) {
            Metrics::instance().record_message_received(bytes_read);

            // Update last activity timestamp
            {
                std::lock_guard<std::mutex> lock(clients_mutex_);
                auto it = clients_.find(client_fd);
                if (it != clients_.end()) {
                    it->second->last_activity = std::chrono::steady_clock::now();
                }
            }

            read_buf.append(temp_buf, bytes_read);

            // Extract all fully assembled frames in the buffer
            Message msg;
            bool corrupted = false;
            while (read_buf.extract_message(msg, corrupted)) {
                process_client_message(client_fd, msg);
            }

            if (corrupted) {
                LOG_WARN("Client fd=" << client_fd << " sent corrupted frame. Closing connection.");
                send_message_to_fd(client_fd, Message::make_error("Corrupted protocol frame"));
                break;
            }
        } else if (bytes_read == 0) {
            // Client closed connection cleanly
            break;
        } else {
            // Socket error or interrupt
            if (errno != EINTR && errno != EAGAIN && errno != EWOULDBLOCK) {
                break;
            }
        }
    }

    handle_disconnect(client_fd, "Connection closed");
}

void ClassicServer::process_client_message(int client_fd, const Message& msg) {
    switch (msg.type) {
        case MessageType::USER_REGISTER: {
            std::string err;
            if (room_manager_.register_user(client_fd, msg.payload, err)) {
                send_message_to_fd(client_fd, Message::make_notify("Welcome to PulseChat, " + msg.payload + "! Default room is #general."));
                broadcast_to_room("general", Message::make_notify("[SERVER] " + msg.payload + " joined the chat."), client_fd);
                LOG_INFO("User registered: " << msg.payload << " (fd=" << client_fd << ")");
            } else {
                send_message_to_fd(client_fd, Message::make_error("Registration failed: " + err));
            }
            break;
        }

        case MessageType::CHAT_MESSAGE: {
            auto username = room_manager_.get_username(client_fd);
            if (!username) {
                send_message_to_fd(client_fd, Message::make_error("Must register username first via USER_REGISTER"));
                return;
            }
            auto room = room_manager_.get_user_room(client_fd).value_or("general");
            std::string formatted_msg = "[" + room + "] " + *username + ": " + msg.payload;
            broadcast_to_room(room, Message::make_chat(formatted_msg));
            break;
        }

        case MessageType::JOIN_ROOM: {
            auto username = room_manager_.get_username(client_fd);
            if (!username) {
                send_message_to_fd(client_fd, Message::make_error("Must register first"));
                return;
            }
            std::string target_room = msg.payload;
            std::string prev_room;
            if (room_manager_.join_room(client_fd, target_room, prev_room)) {
                if (prev_room != target_room) {
                    broadcast_to_room(prev_room, Message::make_notify("[SERVER] " + *username + " left #" + prev_room + " to join #" + target_room));
                    broadcast_to_room(target_room, Message::make_notify("[SERVER] " + *username + " joined #" + target_room));
                }
                send_message_to_fd(client_fd, Message::make_notify("You joined room #" + target_room));
            } else {
                send_message_to_fd(client_fd, Message::make_error("Failed to join room: " + target_room));
            }
            break;
        }

        case MessageType::LEAVE_ROOM: {
            auto username = room_manager_.get_username(client_fd);
            if (!username) return;

            std::string left_room;
            if (room_manager_.leave_room(client_fd, left_room)) {
                broadcast_to_room(left_room, Message::make_notify("[SERVER] " + *username + " left room #" + left_room));
                broadcast_to_room("general", Message::make_notify("[SERVER] " + *username + " returned to #general"));
                send_message_to_fd(client_fd, Message::make_notify("Left #" + left_room + ", returned to #general"));
            } else {
                send_message_to_fd(client_fd, Message::make_notify("Already in default room #general"));
            }
            break;
        }

        case MessageType::PRIVATE_MESSAGE: {
            auto sender_name = room_manager_.get_username(client_fd);
            if (!sender_name) {
                send_message_to_fd(client_fd, Message::make_error("Must register first"));
                return;
            }
            std::string target_user, text;
            if (!Protocol::parse_private_message(msg.payload, target_user, text)) {
                send_message_to_fd(client_fd, Message::make_error("Invalid private message format. Expected 'target:message'"));
                return;
            }
            auto target_fd = room_manager_.get_connection_id(target_user);
            if (target_fd) {
                std::string pm_payload = "[DM from " + *sender_name + "]: " + text;
                send_message_to_fd(*target_fd, Message(MessageType::PRIVATE_MESSAGE, pm_payload));
                send_message_to_fd(client_fd, Message::make_notify("[DM to " + target_user + "]: " + text));
            } else {
                send_message_to_fd(client_fd, Message::make_error("User '" + target_user + "' not found or offline"));
            }
            break;
        }

        case MessageType::LIST_ROOMS: {
            auto rooms = room_manager_.list_rooms();
            std::stringstream ss;
            ss << "=== Active Rooms (" << rooms.size() << ") ===\n";
            for (const auto& r : rooms) {
                ss << "  #" << r.name << " (" << r.user_count << " users)\n";
            }
            send_message_to_fd(client_fd, Message::make_notify(ss.str()));
            break;
        }

        case MessageType::LIST_USERS: {
            auto users = room_manager_.list_all_users();
            std::stringstream ss;
            ss << "=== Online Users (" << users.size() << ") ===\n";
            for (const auto& u : users) {
                ss << "  - " << u << "\n";
            }
            send_message_to_fd(client_fd, Message::make_notify(ss.str()));
            break;
        }

        case MessageType::HEARTBEAT: {
            send_message_to_fd(client_fd, Message::make_heartbeat_ack());
            break;
        }

        case MessageType::HEARTBEAT_ACK: {
            // Heartbeat acknowledged
            break;
        }

        case MessageType::DISCONNECT: {
            handle_disconnect(client_fd, "Client requested disconnect");
            break;
        }

        case MessageType::GET_METRICS: {
            auto s = Metrics::instance().take_snapshot();
            auto rooms = room_manager_.list_rooms();
            std::stringstream ss;
            ss << "{\"uptime_sec\":" << std::fixed << std::setprecision(1) << s.uptime_sec
               << ",\"active_connections\":" << s.active_conns
               << ",\"total_connections\":" << s.total_conns
               << ",\"messages_received\":" << s.total_msgs_recv
               << ",\"messages_sent\":" << s.total_msgs_sent
               << ",\"bytes_received\":" << s.total_bytes_recv
               << ",\"bytes_sent\":" << s.total_bytes_sent
               << ",\"msgs_per_sec\":" << std::fixed << std::setprecision(2) << s.msgs_per_sec
               << ",\"bytes_per_sec\":" << std::fixed << std::setprecision(2) << s.bytes_per_sec
               << ",\"rooms\":[";
            for (size_t i = 0; i < rooms.size(); ++i) {
                if (i > 0) ss << ",";
                ss << "{\"name\":\"" << rooms[i].name << "\",\"users\":" << rooms[i].user_count << "}";
            }
            ss << "]}";
            send_message_to_fd(client_fd, Message::make_metrics_update(ss.str()));
            break;
        }

        default:
            send_message_to_fd(client_fd, Message::make_error("Unsupported message type"));
            break;
    }
}

void ClassicServer::send_message_to_fd(int fd, const Message& msg) {
    std::shared_ptr<ClassicClientContext> ctx;
    {
        std::lock_guard<std::mutex> lock(clients_mutex_);
        auto it = clients_.find(fd);
        if (it == clients_.end()) return;
        ctx = it->second;
    }

    std::vector<uint8_t> data = Protocol::serialize(msg);

    // Lock the client's send mutex to prevent interleaved writes
    std::lock_guard<std::mutex> send_lock(*ctx->send_mutex);
    size_t total_sent = 0;
    while (total_sent < data.size()) {
        ssize_t sent = ::send(fd, data.data() + total_sent, data.size() - total_sent, MSG_NOSIGNAL);
        if (sent <= 0) {
            if (sent < 0 && (errno == EINTR || errno == EAGAIN || errno == EWOULDBLOCK)) {
                continue;
            }
            break; // Broken pipe or client disconnected
        }
        total_sent += sent;
        Metrics::instance().record_message_sent(sent);
    }
}

void ClassicServer::broadcast_to_room(const std::string& room_name, const Message& msg, int exclude_fd) {
    auto members = room_manager_.get_room_members(room_name, exclude_fd);
    for (int fd : members) {
        send_message_to_fd(fd, msg);
    }
}

void ClassicServer::broadcast_to_all(const Message& msg, int exclude_fd) {
    auto all_conns = room_manager_.get_all_members(exclude_fd);
    for (int fd : all_conns) {
        send_message_to_fd(fd, msg);
    }
}

void ClassicServer::handle_disconnect(int client_fd, const std::string& reason) {
    std::string username_str;
    std::string room_str;

    auto username = room_manager_.get_username(client_fd);
    if (username) {
        username_str = *username;
        room_str = room_manager_.get_user_room(client_fd).value_or("general");
        room_manager_.unregister_user(client_fd);
    }

    {
        std::lock_guard<std::mutex> lock(clients_mutex_);
        auto it = clients_.find(client_fd);
        if (it != clients_.end()) {
            ::close(client_fd);
            clients_.erase(it);
            Metrics::instance().record_connection_closed();
        }
    }

    if (!username_str.empty()) {
        broadcast_to_room(room_str, Message::make_notify("[SERVER] " + username_str + " left the chat. (" + reason + ")"));
        LOG_INFO("User " << username_str << " (fd=" << client_fd << ") disconnected: " << reason);
    }
}

void ClassicServer::heartbeat_reaper_loop() {
    while (running_.load()) {
        std::this_thread::sleep_for(std::chrono::seconds(HEARTBEAT_INTERVAL_SEC));
        if (!running_.load()) break;

        auto now = std::chrono::steady_clock::now();
        std::vector<int> dead_fds;

        {
            std::lock_guard<std::mutex> lock(clients_mutex_);
            for (const auto& [fd, ctx] : clients_) {
                auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - ctx->last_activity).count();
                if (elapsed > HEARTBEAT_TIMEOUT_SEC) {
                    dead_fds.push_back(fd);
                }
            }
        }

        for (int fd : dead_fds) {
            LOG_WARN("Heartbeat timeout for client fd=" << fd << ". Reaping connection.");
            handle_disconnect(fd, "Heartbeat timeout");
        }
    }
}

void ClassicServer::metrics_reporter_loop() {
    while (running_.load()) {
        std::this_thread::sleep_for(std::chrono::seconds(15));
        if (!running_.load()) break;

        auto rooms = room_manager_.list_rooms();
        std::vector<std::pair<std::string, size_t>> room_dist;
        for (const auto& r : rooms) {
            room_dist.emplace_back(r.name, r.user_count);
        }

        std::string report = Metrics::instance().format_metrics_report(room_dist);
        std::cout << report << std::endl;
    }
}

} // namespace pulsechat
