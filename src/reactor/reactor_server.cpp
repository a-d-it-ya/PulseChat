#include "reactor_server.hpp"
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <sstream>

namespace pulsechat {

ReactorServer::ReactorServer(uint16_t port)
    : port_(port), dispatcher_(2048),
      last_heartbeat_check_(std::chrono::steady_clock::now()),
      last_metrics_report_(std::chrono::steady_clock::now()) {}

ReactorServer::~ReactorServer() {
    stop();
}

bool ReactorServer::start() {
    if (running_.load()) return false;

    listen_fd_ = ::socket(AF_INET, SOCK_STREAM, 0);
    if (listen_fd_ < 0) {
        LOG_ERROR("ReactorServer: Failed to create socket");
        return false;
    }

    net::set_reuseaddr(listen_fd_);
    net::set_tcp_nodelay(listen_fd_);
    net::set_nonblocking(listen_fd_);

    sockaddr_in server_addr{};
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(port_);

    if (::bind(listen_fd_, reinterpret_cast<sockaddr*>(&server_addr), sizeof(server_addr)) < 0) {
        LOG_ERROR("ReactorServer: Failed to bind to port " << port_);
        ::close(listen_fd_);
        listen_fd_ = -1;
        return false;
    }

    if (::listen(listen_fd_, SOMAXCONN) < 0) {
        LOG_ERROR("ReactorServer: Failed to listen on socket");
        ::close(listen_fd_);
        listen_fd_ = -1;
        return false;
    }

    // Register listening socket with epoll for EPOLLIN
    if (!dispatcher_.add_fd(listen_fd_, EPOLLIN | EPOLLERR | EPOLLHUP)) {
        LOG_ERROR("ReactorServer: Failed to add listen_fd to epoll");
        ::close(listen_fd_);
        listen_fd_ = -1;
        return false;
    }

    running_.store(true);
    LOG_INFO("ReactorServer (epoll Event Loop) running on port " << port_);
    return true;
}

void ReactorServer::run() {
    while (running_.load()) {
        int event_count = dispatcher_.wait(100); // 100ms timeout

        if (event_count < 0) {
            if (errno == EINTR) continue;
            LOG_ERROR("ReactorServer: epoll_wait error");
            break;
        }

        for (size_t i = 0; i < dispatcher_.event_count(); ++i) {
            const auto& event = dispatcher_.get_event(i);
            int fd = event.data.fd;
            uint32_t ev = event.events;

            if (fd == listen_fd_) {
                handle_accept();
            } else {
                if (ev & (EPOLLERR | EPOLLHUP | EPOLLRDHUP)) {
                    handle_close(fd, "Peer closed connection or socket error");
                    continue;
                }

                if (ev & EPOLLIN) {
                    handle_read(fd);
                }

                if (ev & EPOLLOUT) {
                    handle_write(fd);
                }
            }
        }

        // Periodic maintenance tasks
        check_heartbeats();
        report_metrics_if_due();
    }
}

void ReactorServer::stop() {
    if (!running_.exchange(false)) return;

    LOG_INFO("ReactorServer: Stopping server...");

    if (listen_fd_ >= 0) {
        dispatcher_.del_fd(listen_fd_);
        ::close(listen_fd_);
        listen_fd_ = -1;
    }

    for (auto& [fd, conn] : connections_) {
        dispatcher_.del_fd(fd);
    }
    connections_.clear();

    LOG_INFO("ReactorServer: Stopped.");
}

void ReactorServer::handle_accept() {
    while (true) {
        sockaddr_in client_addr{};
        socklen_t addr_len = sizeof(client_addr);
        int client_fd = ::accept(listen_fd_, reinterpret_cast<sockaddr*>(&client_addr), &addr_len);

        if (client_fd < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // All pending connections accepted
                break;
            } else if (errno == EINTR) {
                continue;
            } else {
                LOG_WARN("ReactorServer: accept error: " << std::strerror(errno));
                break;
            }
        }

        net::set_nonblocking(client_fd);
        net::set_tcp_nodelay(client_fd);

        std::string peer_ip = net::get_peer_ip(client_fd);
        auto conn = std::make_unique<ReactorConnection>(client_fd, peer_ip);

        // Register with epoll: Read interest and disconnect detection
        uint32_t events = EPOLLIN | EPOLLRDHUP | EPOLLERR | EPOLLHUP;
        if (!dispatcher_.add_fd(client_fd, events)) {
            LOG_ERROR("Failed to add client fd=" << client_fd << " to epoll");
            ::close(client_fd);
            continue;
        }

        connections_[client_fd] = std::move(conn);
        Metrics::instance().record_connection_opened();
        LOG_INFO("Reactor: Accepted connection from " << peer_ip << " (fd=" << client_fd << ")");
    }
}

void ReactorServer::handle_read(int client_fd) {
    auto it = connections_.find(client_fd);
    if (it == connections_.end()) return;

    ReactorConnection& conn = *(it->second);
    char buf[READ_BUFFER_SIZE];
    bool close_connection = false;

    // Read all available bytes from the non-blocking socket
    while (true) {
        ssize_t bytes_read = ::recv(client_fd, buf, sizeof(buf), 0);
        if (bytes_read > 0) {
            Metrics::instance().record_message_received(bytes_read);
            conn.append_inbound(buf, bytes_read);
        } else if (bytes_read == 0) {
            close_connection = true;
            break;
        } else {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // Done reading available data for now
                break;
            } else if (errno == EINTR) {
                continue;
            } else {
                close_connection = true;
                break;
            }
        }
    }

    if (close_connection) {
        handle_close(client_fd, "Client disconnected");
        return;
    }

    // Process all complete frames extracted from the inbound buffer
    Message msg;
    bool corrupted = false;
    while (conn.extract_message(msg, corrupted)) {
        process_message(client_fd, msg);
    }

    if (corrupted) {
        LOG_DEBUG("Reactor: Non-protocol probe from fd=" << client_fd);
        send_message_to_fd(client_fd, Message::make_error("Corrupted protocol frame"));
        handle_close(client_fd, "Protocol violation");
    }
}

void ReactorServer::handle_write(int client_fd) {
    auto it = connections_.find(client_fd);
    if (it == connections_.end()) return;

    ReactorConnection& conn = *(it->second);
    WriteStatus status = conn.flush_outbound();

    if (status == WriteStatus::ALL_FLUSHED) {
        // No more pending outbound data, disable EPOLLOUT
        dispatcher_.mod_fd(client_fd, EPOLLIN | EPOLLRDHUP | EPOLLERR | EPOLLHUP);
    } else if (status == WriteStatus::WRITE_ERROR) {
        handle_close(client_fd, "Write error");
    }
    // If PENDING_WRITES, keep EPOLLOUT enabled
}

void ReactorServer::handle_close(int client_fd, const std::string& reason) {
    auto it = connections_.find(client_fd);
    if (it == connections_.end()) return;

    std::string username_str;
    std::string room_str;
    auto username = room_manager_.get_username(client_fd);
    if (username) {
        username_str = *username;
        room_str = room_manager_.get_user_room(client_fd).value_or("general");
        room_manager_.unregister_user(client_fd);
    }

    dispatcher_.del_fd(client_fd);
    connections_.erase(it);
    Metrics::instance().record_connection_closed();

    if (!username_str.empty()) {
        broadcast_to_room(room_str, Message::make_notify("[SERVER] " + username_str + " left the chat. (" + reason + ")"));
        LOG_INFO("User " << username_str << " (fd=" << client_fd << ") disconnected: " << reason);
    }
}

void ReactorServer::process_message(int client_fd, const Message& msg) {
    switch (msg.type) {
        case MessageType::USER_REGISTER: {
            std::string err;
            if (room_manager_.register_user(client_fd, msg.payload, err)) {
                send_message_to_fd(client_fd, Message::make_notify("Welcome to PulseChat Reactor, " + msg.payload + "! Default room is #general."));
                broadcast_to_room("general", Message::make_notify("[SERVER] " + msg.payload + " joined the chat."), client_fd);
                LOG_INFO("Reactor: User registered: " << msg.payload << " (fd=" << client_fd << ")");
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
                // Recipient is offline; gateway persists to DB for delivery upon login
                send_message_to_fd(client_fd, Message::make_notify("[DM to " + target_user + "]: " + text));
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
            break;
        }

        case MessageType::DISCONNECT: {
            handle_close(client_fd, "Client requested disconnect");
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

void ReactorServer::send_message_to_fd(int fd, const Message& msg) {
    auto it = connections_.find(fd);
    if (it == connections_.end()) return;

    ReactorConnection& conn = *(it->second);
    conn.queue_message(msg);

    // Try immediate non-blocking flush
    WriteStatus status = conn.flush_outbound();
    if (status == WriteStatus::PENDING_WRITES) {
        // Enable EPOLLOUT so epoll notifies us when the socket is writable again
        dispatcher_.mod_fd(fd, EPOLLIN | EPOLLOUT | EPOLLRDHUP | EPOLLERR | EPOLLHUP);
    } else if (status == WriteStatus::WRITE_ERROR) {
        handle_close(fd, "Write error");
    }
}

void ReactorServer::broadcast_to_room(const std::string& room_name, const Message& msg, int exclude_fd) {
    auto members = room_manager_.get_room_members(room_name, exclude_fd);
    for (int fd : members) {
        send_message_to_fd(fd, msg);
    }
}

void ReactorServer::broadcast_to_all(const Message& msg, int exclude_fd) {
    auto all_conns = room_manager_.get_all_members(exclude_fd);
    for (int fd : all_conns) {
        send_message_to_fd(fd, msg);
    }
}

void ReactorServer::check_heartbeats() {
    auto now = std::chrono::steady_clock::now();
    if (std::chrono::duration_cast<std::chrono::seconds>(now - last_heartbeat_check_).count() < HEARTBEAT_INTERVAL_SEC) {
        return;
    }
    last_heartbeat_check_ = now;

    std::vector<int> dead_fds;
    for (const auto& [fd, conn] : connections_) {
        if (conn->idle_seconds() > HEARTBEAT_TIMEOUT_SEC) {
            dead_fds.push_back(fd);
        }
    }

    for (int fd : dead_fds) {
        LOG_WARN("Reactor: Heartbeat timeout for fd=" << fd << ". Reaping.");
        handle_close(fd, "Heartbeat timeout");
    }
}

void ReactorServer::report_metrics_if_due() {
    auto now = std::chrono::steady_clock::now();
    if (std::chrono::duration_cast<std::chrono::seconds>(now - last_metrics_report_).count() < 15) {
        return;
    }
    last_metrics_report_ = now;

    auto rooms = room_manager_.list_rooms();
    std::vector<std::pair<std::string, size_t>> room_dist;
    for (const auto& r : rooms) {
        room_dist.emplace_back(r.name, r.user_count);
    }

    std::string report = Metrics::instance().format_metrics_report(room_dist);
    std::cout << report << std::endl;
}

} // namespace pulsechat
