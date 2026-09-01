#include "pulsechat/buffer.hpp"
#include <algorithm>
#include <cstring>

namespace pulsechat {

ByteBuffer::ByteBuffer(size_t initial_capacity) {
    buffer_.resize(std::max(initial_capacity, static_cast<size_t>(1024)));
}

void ByteBuffer::append(const void* data, size_t len) {
    if (!data || len == 0) return;

    compact_if_needed();

    // Check if expansion is needed
    if (write_pos_ + len > buffer_.size()) {
        size_t new_size = std::max(buffer_.size() * 2, write_pos_ + len);
        buffer_.resize(new_size);
    }

    std::memcpy(buffer_.data() + write_pos_, data, len);
    write_pos_ += len;
}

void ByteBuffer::append(const std::string& str) {
    append(str.data(), str.size());
}

void ByteBuffer::append(const std::vector<uint8_t>& vec) {
    append(vec.data(), vec.size());
}

const uint8_t* ByteBuffer::read_ptr() const {
    return buffer_.data() + read_pos_;
}

size_t ByteBuffer::readable_bytes() const {
    return write_pos_ - read_pos_;
}

size_t ByteBuffer::capacity() const {
    return buffer_.size();
}

bool ByteBuffer::empty() const {
    return readable_bytes() == 0;
}

void ByteBuffer::consume(size_t len) {
    if (len >= readable_bytes()) {
        clear();
    } else {
        read_pos_ += len;
    }
}

void ByteBuffer::clear() {
    read_pos_ = 0;
    write_pos_ = 0;
}

void ByteBuffer::compact_if_needed() {
    // If the read cursor has moved past halfway or past 4KB, slide remaining bytes to front
    if (read_pos_ > 0 && (read_pos_ >= buffer_.size() / 2 || read_pos_ > 4096)) {
        size_t available = readable_bytes();
        if (available > 0) {
            std::memmove(buffer_.data(), buffer_.data() + read_pos_, available);
        }
        read_pos_ = 0;
        write_pos_ = available;
    }
}

bool ByteBuffer::extract_message(Message& out_msg, bool& out_corrupted) {
    out_corrupted = false;

    // Check if we have at least the 5-byte header
    if (readable_bytes() < HEADER_SIZE) {
        return false;
    }

    MessageType type;
    uint32_t payload_len = 0;
    if (!Protocol::decode_header(read_ptr(), type, payload_len)) {
        // Corrupted header (e.g. invalid type or payload size > MAX_PAYLOAD_SIZE)
        out_corrupted = true;
        return false;
    }

    // Check if entire payload has arrived
    size_t total_frame_size = HEADER_SIZE + payload_len;
    if (readable_bytes() < total_frame_size) {
        // Need more bytes
        return false;
    }

    // Full frame is ready!
    const char* payload_ptr = reinterpret_cast<const char*>(read_ptr() + HEADER_SIZE);
    out_msg.type = type;
    out_msg.payload.assign(payload_ptr, payload_len);

    // Consume the frame
    consume(total_frame_size);
    return true;
}

} // namespace pulsechat
