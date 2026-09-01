#include "pulsechat/protocol.hpp"

namespace pulsechat {

std::vector<uint8_t> Protocol::serialize(const Message& msg) {
    std::vector<uint8_t> buffer;
    serialize_into(msg, buffer);
    return buffer;
}

void Protocol::serialize_into(const Message& msg, std::vector<uint8_t>& out) {
    size_t payload_len = msg.payload.size();
    size_t old_size = out.size();
    out.resize(old_size + HEADER_SIZE + payload_len);

    encode_header(msg.type, static_cast<uint32_t>(payload_len), out.data() + old_size);

    if (payload_len > 0) {
        std::memcpy(out.data() + old_size + HEADER_SIZE, msg.payload.data(), payload_len);
    }
}

void Protocol::encode_header(MessageType type, uint32_t payload_len, uint8_t* out_header) {
    out_header[0] = static_cast<uint8_t>(type);
    uint32_t net_len = htonl(payload_len);
    std::memcpy(out_header + 1, &net_len, sizeof(uint32_t));
}

bool Protocol::decode_header(const uint8_t* header_bytes, MessageType& out_type, uint32_t& out_len) {
    if (!header_bytes) return false;

    uint8_t type_val = header_bytes[0];
    if (type_val < 0x01 || type_val > 0x0E) {
        return false;
    }

    out_type = static_cast<MessageType>(type_val);
    uint32_t net_len = 0;
    std::memcpy(&net_len, header_bytes + 1, sizeof(uint32_t));
    out_len = ntohl(net_len);

    if (out_len > MAX_PAYLOAD_SIZE) {
        return false;
    }

    return true;
}

bool Protocol::parse_private_message(const std::string& payload, std::string& out_target, std::string& out_text) {
    size_t colon_pos = payload.find(':');
    if (colon_pos == std::string::npos || colon_pos == 0) {
        return false;
    }
    out_target = payload.substr(0, colon_pos);
    out_text = payload.substr(colon_pos + 1);
    return true;
}

} // namespace pulsechat
