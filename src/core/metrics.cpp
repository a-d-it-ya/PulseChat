#include "pulsechat/metrics.hpp"
#include <sstream>
#include <iomanip>

namespace pulsechat {

Metrics& Metrics::instance() {
    static Metrics inst;
    return inst;
}

Metrics::Metrics() {
    start_time_ = std::chrono::steady_clock::now();
    last_snapshot_time_ = start_time_;
}

void Metrics::record_connection_opened() {
    active_connections_.fetch_add(1, std::memory_order_relaxed);
    total_connections_.fetch_add(1, std::memory_order_relaxed);
}

void Metrics::record_connection_closed() {
    active_connections_.fetch_sub(1, std::memory_order_relaxed);
}

void Metrics::record_message_received(size_t bytes) {
    messages_received_.fetch_add(1, std::memory_order_relaxed);
    if (bytes > 0) {
        bytes_received_.fetch_add(bytes, std::memory_order_relaxed);
    }
}

void Metrics::record_message_sent(size_t bytes) {
    messages_sent_.fetch_add(1, std::memory_order_relaxed);
    if (bytes > 0) {
        bytes_sent_.fetch_add(bytes, std::memory_order_relaxed);
    }
}

uint64_t Metrics::active_connections() const {
    return active_connections_.load(std::memory_order_relaxed);
}

uint64_t Metrics::total_connections() const {
    return total_connections_.load(std::memory_order_relaxed);
}

uint64_t Metrics::total_messages_received() const {
    return messages_received_.load(std::memory_order_relaxed);
}

uint64_t Metrics::total_messages_sent() const {
    return messages_sent_.load(std::memory_order_relaxed);
}

uint64_t Metrics::total_bytes_received() const {
    return bytes_received_.load(std::memory_order_relaxed);
}

uint64_t Metrics::total_bytes_sent() const {
    return bytes_sent_.load(std::memory_order_relaxed);
}

Metrics::Snapshot Metrics::take_snapshot() {
    auto now = std::chrono::steady_clock::now();
    double elapsed = std::chrono::duration<double>(now - last_snapshot_time_).count();
    if (elapsed <= 0.000001) elapsed = 1.0;

    uint64_t current_msgs = messages_received_.load(std::memory_order_relaxed);
    uint64_t current_bytes = bytes_received_.load(std::memory_order_relaxed) + bytes_sent_.load(std::memory_order_relaxed);

    double msgs_rate = static_cast<double>(current_msgs - last_msgs_count_) / elapsed;
    double bytes_rate = static_cast<double>(current_bytes - last_bytes_count_) / elapsed;

    last_snapshot_time_ = now;
    last_msgs_count_ = current_msgs;
    last_bytes_count_ = current_bytes;

    Snapshot s{};
    s.active_conns = active_connections_.load(std::memory_order_relaxed);
    s.total_conns = total_connections_.load(std::memory_order_relaxed);
    s.total_msgs_recv = current_msgs;
    s.total_msgs_sent = messages_sent_.load(std::memory_order_relaxed);
    s.total_bytes_recv = bytes_received_.load(std::memory_order_relaxed);
    s.total_bytes_sent = bytes_sent_.load(std::memory_order_relaxed);
    s.msgs_per_sec = msgs_rate;
    s.bytes_per_sec = bytes_rate;
    s.uptime_sec = std::chrono::duration<double>(now - start_time_).count();

    return s;
}

std::string Metrics::format_metrics_report(const std::vector<std::pair<std::string, size_t>>& room_distribution) {
    Snapshot s = take_snapshot();
    std::stringstream ss;
    ss << "\n==================== PulseChat Metrics ====================\n";
    ss << " Uptime:             " << std::fixed << std::setprecision(1) << s.uptime_sec << " s\n";
    ss << " Active Connections: " << s.active_conns << "\n";
    ss << " Total Connections:  " << s.total_conns << "\n";
    ss << " Messages Received:  " << s.total_msgs_recv << "\n";
    ss << " Messages Sent:      " << s.total_msgs_sent << "\n";
    ss << " Messages/sec:       " << std::fixed << std::setprecision(2) << s.msgs_per_sec << "\n";
    ss << " Throughput:         " << std::fixed << std::setprecision(2) << (s.bytes_per_sec / 1024.0) << " KB/s\n";
    ss << " Total Traffic:      " << std::fixed << std::setprecision(2) << ((s.total_bytes_recv + s.total_bytes_sent) / 1024.0) << " KB\n";

    if (!room_distribution.empty()) {
        ss << " ------------------ Active Rooms -------------------\n";
        for (const auto& [room, count] : room_distribution) {
            ss << "   #" << room << ": " << count << " user" << (count == 1 ? "" : "s") << "\n";
        }
    }
    ss << "===========================================================\n";
    return ss.str();
}

} // namespace pulsechat
