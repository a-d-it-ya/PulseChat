#pragma once

#include <iostream>
#include <string>
#include <string_view>
#include <vector>
#include <memory>
#include <chrono>
#include <sstream>
#include <iomanip>
#include <cstring>
#include <cstdint>
#include <cstdlib>

#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>

namespace pulsechat {

constexpr uint16_t DEFAULT_PORT = 9000;
constexpr size_t MAX_PAYLOAD_SIZE = 64 * 1024; // 64 KB max frame payload
constexpr size_t READ_BUFFER_SIZE = 8 * 1024;  // 8 KB read chunk
constexpr int HEARTBEAT_INTERVAL_SEC = 10;
constexpr int HEARTBEAT_TIMEOUT_SEC = 30;

// Logging utilities with timestamp
inline std::string current_timestamp() {
    auto now = std::chrono::system_clock::now();
    auto in_time_t = std::chrono::system_clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                  now.time_since_epoch()) % 1000;
    std::stringstream ss;
    ss << std::put_time(std::localtime(&in_time_t), "%Y-%m-%d %H:%M:%S")
       << '.' << std::setfill('0') << std::setw(3) << ms.count();
    return ss.str();
}

#define LOG_INFO(msg) \
    std::cout << "[INFO]  [" << pulsechat::current_timestamp() << "] " msg << std::endl

#define LOG_WARN(msg) \
    std::cerr << "[WARN]  [" << pulsechat::current_timestamp() << "] " msg << std::endl

#define LOG_ERROR(msg) \
    std::cerr << "[ERROR] [" << pulsechat::current_timestamp() << "] " msg << " (" << std::strerror(errno) << ")" << std::endl

#define LOG_DEBUG(msg) \
    std::cout << "[DEBUG] [" << pulsechat::current_timestamp() << "] " msg << std::endl

// Socket helper utilities
namespace net {

inline bool set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags == -1) return false;
    return fcntl(fd, F_SETFL, flags | O_NONBLOCK) != -1;
}

inline bool set_reuseaddr(int fd) {
    int opt = 1;
    return setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) == 0;
}

inline bool set_tcp_nodelay(int fd) {
    int opt = 1;
    return setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &opt, sizeof(opt)) == 0;
}

inline bool set_keepalive(int fd) {
    int opt = 1;
    return setsockopt(fd, SOL_SOCKET, SO_KEEPALIVE, &opt, sizeof(opt)) == 0;
}

inline std::string get_peer_ip(int fd) {
    sockaddr_in addr{};
    socklen_t len = sizeof(addr);
    if (getpeername(fd, reinterpret_cast<sockaddr*>(&addr), &len) == 0) {
        char ip[INET_ADDRSTRLEN];
        if (inet_ntop(AF_INET, &addr.sin_addr, ip, sizeof(ip))) {
            return std::string(ip) + ":" + std::to_string(ntohs(addr.sin_port));
        }
    }
    return "unknown";
}

} // namespace net

} // namespace pulsechat
