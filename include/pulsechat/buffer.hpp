#pragma once

#include "pulsechat/protocol.hpp"
#include <vector>
#include <cstdint>
#include <cstddef>
#include <string>
#include <optional>

namespace pulsechat {

class ByteBuffer {
public:
    explicit ByteBuffer(size_t initial_capacity = 4096);

    // Append data into the buffer
    void append(const void* data, size_t len);
    void append(const std::string& str);
    void append(const std::vector<uint8_t>& vec);

    // Read pointers and sizes
    const uint8_t* read_ptr() const;
    size_t readable_bytes() const;
    size_t capacity() const;
    bool empty() const;

    // Advance read cursor by len bytes
    void consume(size_t len);

    // Clear all contents and reset pointers
    void clear();

    // Attempts to extract the next complete framed Message from the buffer.
    // Returns:
    //   true + populated out_msg if a full valid frame is parsed & consumed.
    //   false if the buffer does not yet contain a complete frame (need more recv data).
    //   Throws or sets error flag if frame header is corrupted/invalid.
    bool extract_message(Message& out_msg, bool& out_corrupted);

private:
    void compact_if_needed();

    std::vector<uint8_t> buffer_;
    size_t read_pos_{0};
    size_t write_pos_{0};
};

} // namespace pulsechat
