#pragma once

#include "pulsechat/common.hpp"
#include "pulsechat/protocol.hpp"
#include "pulsechat/buffer.hpp"
#include "pulsechat/room_manager.hpp"
#include "pulsechat/metrics.hpp"

#include <unordered_map>
#include <thread>
#include <mutex>
#include <atomic>
#include <vector>

namespace pulsechat {

struct ClassicClientContext {
    int socket_fd{-1};
    std::string ip_port;
    std::chrono::steady_clock::time_point last_activity;
    std::unique_ptr<std::mutex> send_mutex;

    ClassicClientContext(int fd, std::string addr)
        : socket_fd(fd), ip_port(std::move(addr)),
          last_activity(std::chrono::steady_clock::now()),
          send_mutex(std::make_unique<std::mutex>()) {}
};

class ClassicServer {
public:
    explicit ClassicServer(uint16_t port = DEFAULT_PORT);
    ~ClassicServer();

    bool start();
    void stop();
    void wait_until_stopped();

private:
    void accept_loop();
    void client_handler(int client_fd);
    void heartbeat_reaper_loop();
    void metrics_reporter_loop();

    void send_message_to_fd(int fd, const Message& msg);
    void broadcast_to_room(const std::string& room_name, const Message& msg, int exclude_fd = -1);
    void broadcast_to_all(const Message& msg, int exclude_fd = -1);

    void process_client_message(int client_fd, const Message& msg);
    void handle_disconnect(int client_fd, const std::string& reason = "Client disconnected");

    uint16_t port_;
    int listen_fd_{-1};
    std::atomic<bool> running_{false};

    RoomManager room_manager_;

    std::thread listener_thread_;
    std::thread reaper_thread_;
    std::thread metrics_thread_;

    std::mutex clients_mutex_;
    std::unordered_map<int, std::shared_ptr<ClassicClientContext>> clients_;
    std::vector<std::thread> worker_threads_;
};

} // namespace pulsechat
