#pragma once

#include "pulsechat/common.hpp"
#include <string>
#include <vector>
#include <cstdint>
#include <optional>

namespace pulsechat {

enum class MessageType : uint8_t {
    CHAT_MESSAGE        = 0x01,
    JOIN_ROOM           = 0x02,
    LEAVE_ROOM          = 0x03,
    PRIVATE_MESSAGE     = 0x04,
    HEARTBEAT           = 0x05,
    HEARTBEAT_ACK       = 0x06,
    USER_REGISTER       = 0x07,
    SERVER_NOTIFICATION = 0x08,
    LIST_ROOMS          = 0x09,
    LIST_USERS          = 0x0A,
    ERROR_RESPONSE      = 0x0B,
    DISCONNECT          = 0x0C,
    GET_METRICS         = 0x0D,
    METRICS_UPDATE      = 0x0E
};

inline const char* message_type_to_string(MessageType type) {
    switch (type) {
        case MessageType::CHAT_MESSAGE:        return "CHAT_MESSAGE";
        case MessageType::JOIN_ROOM:           return "JOIN_ROOM";
        case MessageType::LEAVE_ROOM:          return "LEAVE_ROOM";
        case MessageType::PRIVATE_MESSAGE:     return "PRIVATE_MESSAGE";
        case MessageType::HEARTBEAT:           return "HEARTBEAT";
        case MessageType::HEARTBEAT_ACK:       return "HEARTBEAT_ACK";
        case MessageType::USER_REGISTER:       return "USER_REGISTER";
        case MessageType::SERVER_NOTIFICATION: return "SERVER_NOTIFICATION";
        case MessageType::LIST_ROOMS:          return "LIST_ROOMS";
        case MessageType::LIST_USERS:          return "LIST_USERS";
        case MessageType::ERROR_RESPONSE:      return "ERROR_RESPONSE";
        case MessageType::DISCONNECT:          return "DISCONNECT";
        case MessageType::GET_METRICS:         return "GET_METRICS";
        case MessageType::METRICS_UPDATE:      return "METRICS_UPDATE";
        default:                               return "UNKNOWN";
    }
}

// 5-byte header: [TYPE: 1 byte] [LENGTH: 4 bytes big-endian]
constexpr size_t HEADER_SIZE = 5;

struct Message {
    MessageType type{MessageType::CHAT_MESSAGE};
    std::string payload;

    // Helper constructors
    Message() = default;
    Message(MessageType t, std::string p) : type(t), payload(std::move(p)) {}

    // Factory methods
    static Message make_chat(const std::string& text) {
        return Message(MessageType::CHAT_MESSAGE, text);
    }
    static Message make_join(const std::string& room) {
        return Message(MessageType::JOIN_ROOM, room);
    }
    static Message make_leave(const std::string& room = "") {
        return Message(MessageType::LEAVE_ROOM, room);
    }
    static Message make_private(const std::string& target_user, const std::string& text) {
        return Message(MessageType::PRIVATE_MESSAGE, target_user + ":" + text);
    }
    static Message make_heartbeat(const std::string& data = "PING") {
        return Message(MessageType::HEARTBEAT, data);
    }
    static Message make_heartbeat_ack(const std::string& data = "PONG") {
        return Message(MessageType::HEARTBEAT_ACK, data);
    }
    static Message make_register(const std::string& username) {
        return Message(MessageType::USER_REGISTER, username);
    }
    static Message make_notify(const std::string& notification) {
        return Message(MessageType::SERVER_NOTIFICATION, notification);
    }
    static Message make_error(const std::string& err) {
        return Message(MessageType::ERROR_RESPONSE, err);
    }
    static Message make_metrics_update(const std::string& json_payload) {
        return Message(MessageType::METRICS_UPDATE, json_payload);
    }
};

class Protocol {
public:
    // Serializes a Message into a wire-format byte array [1 byte type][4 bytes len][N bytes payload]
    static std::vector<uint8_t> serialize(const Message& msg);

    // Appends serialized message directly to a target buffer
    static void serialize_into(const Message& msg, std::vector<uint8_t>& out);

    // Encodes a 5-byte header into the provided buffer
    static void encode_header(MessageType type, uint32_t payload_len, uint8_t* out_header);

    // Decodes a 5-byte header from buffer
    static bool decode_header(const uint8_t* header_bytes, MessageType& out_type, uint32_t& out_len);

    // Helper to parse target user and content from PRIVATE_MESSAGE payload ("target:text")
    static bool parse_private_message(const std::string& payload, std::string& out_target, std::string& out_text);
};

} // namespace pulsechat
