#pragma once

#include "pulsechat/common.hpp"
#include <atomic>
#include <chrono>
#include <string>
#include <vector>

namespace pulsechat {

class Metrics {
public:
    static Metrics& instance();

    void record_connection_opened();
    void record_connection_closed();
    void record_message_received(size_t bytes = 0);
    void record_message_sent(size_t bytes = 0);

    // Getters
    uint64_t active_connections() const;
    uint64_t total_connections() const;
    uint64_t total_messages_received() const;
    uint64_t total_messages_sent() const;
    uint64_t total_bytes_received() const;
    uint64_t total_bytes_sent() const;

    // Rates calculation
    struct Snapshot {
        uint64_t active_conns;
        uint64_t total_conns;
        uint64_t total_msgs_recv;
        uint64_t total_msgs_sent;
        uint64_t total_bytes_recv;
        uint64_t total_bytes_sent;
        double msgs_per_sec;
        double bytes_per_sec;
        double uptime_sec;
    };

    Snapshot take_snapshot();
    std::string format_metrics_report(const std::vector<std::pair<std::string, size_t>>& room_distribution = {});

private:
    Metrics();

    std::atomic<uint64_t> active_connections_{0};
    std::atomic<uint64_t> total_connections_{0};
    std::atomic<uint64_t> messages_received_{0};
    std::atomic<uint64_t> messages_sent_{0};
    std::atomic<uint64_t> bytes_received_{0};
    std::atomic<uint64_t> bytes_sent_{0};

    std::chrono::steady_clock::time_point start_time_;
    std::chrono::steady_clock::time_point last_snapshot_time_;
    uint64_t last_msgs_count_{0};
    uint64_t last_bytes_count_{0};
};

} // namespace pulsechat
