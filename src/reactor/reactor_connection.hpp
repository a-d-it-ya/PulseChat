#pragma once

#include "pulsechat/common.hpp"
#include "pulsechat/protocol.hpp"
#include "pulsechat/buffer.hpp"

#include <string>
#include <vector>
#include <chrono>
#include <memory>

namespace pulsechat {

enum class ConnectionState {
    CONNECTED,
    REGISTERED,
    CLOSING
};

enum class WriteStatus {
    ALL_FLUSHED,
    PENDING_WRITES,
    WRITE_ERROR
};

class ReactorConnection {
public:
    explicit ReactorConnection(int fd, std::string peer_addr);
    ~ReactorConnection();

    // Socket FD
    int fd() const { return fd_; }
    const std::string& peer_address() const { return peer_address_; }

    // State management
    ConnectionState state() const { return state_; }
    void set_state(ConnectionState s) { state_ = s; }

    // Inbound buffer operations
    void append_inbound(const void* data, size_t len);
    bool extract_message(Message& out_msg, bool& out_corrupted);

    // Outbound buffer operations
    void queue_message(const Message& msg);
    void queue_raw_bytes(const std::vector<uint8_t>& bytes);
    WriteStatus flush_outbound();
    bool has_pending_writes() const;

    // Heartbeat tracking
    void update_activity();
    int64_t idle_seconds() const;

private:
    int fd_{-1};
    std::string peer_address_;
    ConnectionState state_{ConnectionState::CONNECTED};

    ByteBuffer in_buffer_;
    ByteBuffer out_buffer_;

    std::chrono::steady_clock::time_point last_activity_;
};

} // namespace pulsechat
