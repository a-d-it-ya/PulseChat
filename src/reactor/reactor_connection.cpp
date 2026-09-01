#include "reactor_connection.hpp"
#include "pulsechat/metrics.hpp"
#include <unistd.h>
#include <sys/socket.h>
#include <errno.h>

namespace pulsechat {

ReactorConnection::ReactorConnection(int fd, std::string peer_addr)
    : fd_(fd), peer_address_(std::move(peer_addr)),
      in_buffer_(4096), out_buffer_(4096),
      last_activity_(std::chrono::steady_clock::now()) {}

ReactorConnection::~ReactorConnection() {
    if (fd_ >= 0) {
        ::close(fd_);
        fd_ = -1;
    }
}

void ReactorConnection::append_inbound(const void* data, size_t len) {
    in_buffer_.append(data, len);
    update_activity();
}

bool ReactorConnection::extract_message(Message& out_msg, bool& out_corrupted) {
    return in_buffer_.extract_message(out_msg, out_corrupted);
}

void ReactorConnection::queue_message(const Message& msg) {
    std::vector<uint8_t> data = Protocol::serialize(msg);
    queue_raw_bytes(data);
}

void ReactorConnection::queue_raw_bytes(const std::vector<uint8_t>& bytes) {
    out_buffer_.append(bytes);
}

WriteStatus ReactorConnection::flush_outbound() {
    while (out_buffer_.readable_bytes() > 0) {
        ssize_t sent = ::send(fd_, out_buffer_.read_ptr(), out_buffer_.readable_bytes(), MSG_NOSIGNAL);
        if (sent > 0) {
            out_buffer_.consume(static_cast<size_t>(sent));
            Metrics::instance().record_message_sent(sent);
        } else if (sent < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // Socket send buffer is full, wait for EPOLLOUT
                return WriteStatus::PENDING_WRITES;
            } else if (errno == EINTR) {
                continue; // retry
            } else {
                // Serious error (e.g. ECONNRESET, EPIPE)
                return WriteStatus::WRITE_ERROR;
            }
        } else {
            // Sent 0 bytes
            return WriteStatus::WRITE_ERROR;
        }
    }

    return WriteStatus::ALL_FLUSHED;
}

bool ReactorConnection::has_pending_writes() const {
    return out_buffer_.readable_bytes() > 0;
}

void ReactorConnection::update_activity() {
    last_activity_ = std::chrono::steady_clock::now();
}

int64_t ReactorConnection::idle_seconds() const {
    auto now = std::chrono::steady_clock::now();
    return std::chrono::duration_cast<std::chrono::seconds>(now - last_activity_).count();
}

} // namespace pulsechat
