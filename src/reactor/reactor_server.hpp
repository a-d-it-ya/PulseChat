#pragma once

#include "pulsechat/common.hpp"
#include "pulsechat/protocol.hpp"
#include "pulsechat/room_manager.hpp"
#include "pulsechat/metrics.hpp"
#include "epoll_dispatcher.hpp"
#include "reactor_connection.hpp"

#include <unordered_map>
#include <memory>
#include <atomic>
#include <chrono>

namespace pulsechat {

class ReactorServer {
public:
    explicit ReactorServer(uint16_t port = DEFAULT_PORT);
    ~ReactorServer();

    bool start();
    void run();
    void stop();

private:
    void init_listener();
    void handle_accept();
    void handle_read(int client_fd);
    void handle_write(int client_fd);
    void handle_close(int client_fd, const std::string& reason = "Client disconnected");

    void process_message(int client_fd, const Message& msg);
    void send_message_to_fd(int fd, const Message& msg);
    void broadcast_to_room(const std::string& room_name, const Message& msg, int exclude_fd = -1);
    void broadcast_to_all(const Message& msg, int exclude_fd = -1);

    void check_heartbeats();
    void report_metrics_if_due();

    uint16_t port_;
    int listen_fd_{-1};
    std::atomic<bool> running_{false};

    EpollDispatcher dispatcher_;
    RoomManager room_manager_;

    std::unordered_map<int, std::unique_ptr<ReactorConnection>> connections_;

    std::chrono::steady_clock::time_point last_heartbeat_check_;
    std::chrono::steady_clock::time_point last_metrics_report_;
};

} // namespace pulsechat
