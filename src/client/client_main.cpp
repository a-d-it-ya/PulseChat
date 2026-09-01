#include "pulsechat/common.hpp"
#include "pulsechat/protocol.hpp"
#include "pulsechat/buffer.hpp"

#include <iostream>
#include <string>
#include <thread>
#include <atomic>
#include <csignal>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>

namespace {
// ANSI Colors for rich CLI output
const char* ANSI_RESET   = "\033[0m";
const char* ANSI_BOLD    = "\033[1m";
const char* ANSI_RED     = "\033[31m";
const char* ANSI_GREEN   = "\033[32m";
const char* ANSI_YELLOW  = "\033[33m";
const char* ANSI_BLUE    = "\033[34m";
const char* ANSI_MAGENTA = "\033[35m";
const char* ANSI_CYAN    = "\033[36m";
}

class PulseClient {
public:
    PulseClient(std::string host, uint16_t port, std::string username)
        : host_(std::move(host)), port_(port), username_(std::move(username)) {}

    ~PulseClient() {
        disconnect();
    }

    bool connect_to_server() {
        socket_fd_ = ::socket(AF_INET, SOCK_STREAM, 0);
        if (socket_fd_ < 0) {
            std::cerr << ANSI_RED << "Failed to create socket." << ANSI_RESET << std::endl;
            return false;
        }

        pulsechat::net::set_tcp_nodelay(socket_fd_);

        sockaddr_in server_addr{};
        server_addr.sin_family = AF_INET;
        server_addr.sin_port = htons(port_);

        if (inet_pton(AF_INET, host_.c_str(), &server_addr.sin_addr) <= 0) {
            // Try resolving hostname
            hostent* he = gethostbyname(host_.c_str());
            if (!he) {
                std::cerr << ANSI_RED << "Failed to resolve host: " << host_ << ANSI_RESET << std::endl;
                ::close(socket_fd_);
                socket_fd_ = -1;
                return false;
            }
            std::memcpy(&server_addr.sin_addr, he->h_addr_list[0], he->h_length);
        }

        if (::connect(socket_fd_, reinterpret_cast<sockaddr*>(&server_addr), sizeof(server_addr)) < 0) {
            std::cerr << ANSI_RED << "Failed to connect to " << host_ << ":" << port_ 
                      << " (" << std::strerror(errno) << ")" << ANSI_RESET << std::endl;
            ::close(socket_fd_);
            socket_fd_ = -1;
            return false;
        }

        running_.store(true);
        std::cout << ANSI_GREEN << "Connected to PulseChat server at " << host_ << ":" << port_ << ANSI_RESET << std::endl;

        // Start background receiver
        recv_thread_ = std::thread(&PulseClient::receive_loop, this);

        // Start background heartbeat
        heartbeat_thread_ = std::thread(&PulseClient::heartbeat_loop, this);

        // Send registration
        send_frame(pulsechat::Message::make_register(username_));

        return true;
    }

    void start_interactive_session() {
        print_help();

        std::string line;
        while (running_.load()) {
            std::cout << "> " << std::flush;
            if (!std::getline(std::cin, line)) {
                break;
            }

            if (line.empty()) continue;

            if (line[0] == '/') {
                handle_slash_command(line);
            } else {
                send_frame(pulsechat::Message::make_chat(line));
            }
        }

        disconnect();
    }

    void disconnect() {
        if (!running_.exchange(false)) return;

        if (socket_fd_ >= 0) {
            send_frame(pulsechat::Message(pulsechat::MessageType::DISCONNECT, "User exit"));
            ::shutdown(socket_fd_, SHUT_RDWR);
            ::close(socket_fd_);
            socket_fd_ = -1;
        }

        if (recv_thread_.joinable()) recv_thread_.join();
        if (heartbeat_thread_.joinable()) heartbeat_thread_.join();
    }

private:
    void send_frame(const pulsechat::Message& msg) {
        if (socket_fd_ < 0) return;
        std::vector<uint8_t> data = pulsechat::Protocol::serialize(msg);
        size_t total_sent = 0;
        while (total_sent < data.size()) {
            ssize_t sent = ::send(socket_fd_, data.data() + total_sent, data.size() - total_sent, MSG_NOSIGNAL);
            if (sent <= 0) break;
            total_sent += sent;
        }
    }

    void receive_loop() {
        pulsechat::ByteBuffer in_buf(4096);
        char temp[pulsechat::READ_BUFFER_SIZE];

        while (running_.load()) {
            ssize_t n = ::recv(socket_fd_, temp, sizeof(temp), 0);
            if (n > 0) {
                in_buf.append(temp, n);
                pulsechat::Message msg;
                bool corrupted = false;
                while (in_buf.extract_message(msg, corrupted)) {
                    render_message(msg);
                }
                if (corrupted) {
                    std::cerr << "\n" << ANSI_RED << "[ERROR] Corrupted protocol frame received from server." << ANSI_RESET << "\n> " << std::flush;
                    break;
                }
            } else if (n == 0) {
                std::cout << "\n" << ANSI_YELLOW << "[INFO] Server closed connection." << ANSI_RESET << std::endl;
                break;
            } else {
                if (errno != EINTR && errno != EAGAIN) {
                    break;
                }
            }
        }

        running_.store(false);
    }

    void heartbeat_loop() {
        while (running_.load()) {
            std::this_thread::sleep_for(std::chrono::seconds(pulsechat::HEARTBEAT_INTERVAL_SEC));
            if (!running_.load()) break;
            send_frame(pulsechat::Message::make_heartbeat("PING"));
        }
    }

    void render_message(const pulsechat::Message& msg) {
        // Clear current line prompt and print message
        std::cout << "\r\033[K";

        switch (msg.type) {
            case pulsechat::MessageType::SERVER_NOTIFICATION:
                std::cout << ANSI_CYAN << ANSI_BOLD << msg.payload << ANSI_RESET << "\n";
                break;
            case pulsechat::MessageType::CHAT_MESSAGE:
                std::cout << ANSI_GREEN << msg.payload << ANSI_RESET << "\n";
                break;
            case pulsechat::MessageType::PRIVATE_MESSAGE:
                std::cout << ANSI_MAGENTA << ANSI_BOLD << msg.payload << ANSI_RESET << "\n";
                break;
            case pulsechat::MessageType::ERROR_RESPONSE:
                std::cerr << ANSI_RED << "[ERROR] " << msg.payload << ANSI_RESET << "\n";
                break;
            case pulsechat::MessageType::HEARTBEAT_ACK:
                // Silent heartbeat response
                break;
            default:
                std::cout << "[MSG] " << msg.payload << "\n";
                break;
        }

        std::cout << "> " << std::flush;
    }

    void handle_slash_command(const std::string& line) {
        if (line == "/help") {
            print_help();
        } else if (line.rfind("/join ", 0) == 0) {
            std::string room = line.substr(6);
            if (!room.empty()) {
                send_frame(pulsechat::Message::make_join(room));
            } else {
                std::cout << "Usage: /join <room_name>\n";
            }
        } else if (line == "/leave") {
            send_frame(pulsechat::Message::make_leave());
        } else if (line == "/rooms") {
            send_frame(pulsechat::Message(pulsechat::MessageType::LIST_ROOMS, ""));
        } else if (line == "/users") {
            send_frame(pulsechat::Message(pulsechat::MessageType::LIST_USERS, ""));
        } else if (line.rfind("/msg ", 0) == 0) {
            size_t first_space = line.find(' ', 5);
            if (first_space != std::string::npos) {
                std::string target = line.substr(5, first_space - 5);
                std::string text = line.substr(first_space + 1);
                send_frame(pulsechat::Message::make_private(target, text));
            } else {
                std::cout << "Usage: /msg <username> <message>\n";
            }
        } else if (line == "/quit" || line == "/exit") {
            running_.store(false);
        } else {
            std::cout << ANSI_YELLOW << "Unknown command: " << line << ". Type /help for command list." << ANSI_RESET << "\n";
        }
    }

    void print_help() {
        std::cout << "\n" << ANSI_BOLD << "PulseChat Commands:" << ANSI_RESET << "\n"
                  << "  " << ANSI_CYAN << "/join <room>" << ANSI_RESET << "          - Join or create a room (e.g. /join engineering)\n"
                  << "  " << ANSI_CYAN << "/leave" << ANSI_RESET << "                - Leave current room and return to #general\n"
                  << "  " << ANSI_CYAN << "/rooms" << ANSI_RESET << "                - List all active chat rooms and user counts\n"
                  << "  " << ANSI_CYAN << "/users" << ANSI_RESET << "                - List all currently connected users\n"
                  << "  " << ANSI_CYAN << "/msg <user> <msg>" << ANSI_RESET << "     - Send a private direct message to <user>\n"
                  << "  " << ANSI_CYAN << "/help" << ANSI_RESET << "                 - Show this help menu\n"
                  << "  " << ANSI_CYAN << "/quit" << ANSI_RESET << "                 - Disconnect and exit\n\n";
    }

    std::string host_;
    uint16_t port_;
    std::string username_;
    int socket_fd_{-1};
    std::atomic<bool> running_{false};

    std::thread recv_thread_;
    std::thread heartbeat_thread_;
};

static PulseClient* g_client = nullptr;

void client_sig_handler(int) {
    if (g_client) {
        g_client->disconnect();
    }
}

int main(int argc, char* argv[]) {
    std::string host = "127.0.0.1";
    uint16_t port = pulsechat::DEFAULT_PORT;
    std::string username;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if ((arg == "-h" || arg == "--host") && i + 1 < argc) {
            host = argv[++i];
        } else if ((arg == "-p" || arg == "--port") && i + 1 < argc) {
            port = static_cast<uint16_t>(std::stoi(argv[++i]));
        } else if ((arg == "-u" || arg == "--user") && i + 1 < argc) {
            username = argv[++i];
        } else if (arg == "--help") {
            std::cout << "Usage: pulsechat_client [options]\n"
                      << "Options:\n"
                      << "  -h, --host <host>       Server host (default: 127.0.0.1)\n"
                      << "  -p, --port <port>       Server port (default: " << pulsechat::DEFAULT_PORT << ")\n"
                      << "  -u, --user <username>   Username for registration\n";
            return 0;
        }
    }

    if (username.empty()) {
        std::cout << "Enter username: " << std::flush;
        std::getline(std::cin, username);
        if (username.empty()) {
            std::cerr << "Username cannot be empty." << std::endl;
            return 1;
        }
    }

    std::signal(SIGINT, client_sig_handler);
    std::signal(SIGTERM, client_sig_handler);

    PulseClient client(host, port, username);
    g_client = &client;

    if (!client.connect_to_server()) {
        return 1;
    }

    client.start_interactive_session();
    std::cout << "Goodbye!" << std::endl;
    return 0;
}
