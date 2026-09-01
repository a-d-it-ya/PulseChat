#pragma once

#include "pulsechat/common.hpp"
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>
#include <mutex>
#include <shared_mutex>
#include <optional>

namespace pulsechat {

using ConnectionId = int; // File descriptor or unique ID

struct UserInfo {
    ConnectionId conn_id{-1};
    std::string username;
    std::string current_room{"general"};
    std::chrono::steady_clock::time_point last_active;
};

struct RoomInfo {
    std::string name;
    std::unordered_set<ConnectionId> members;
};

class RoomManager {
public:
    RoomManager();

    // User registration
    bool register_user(ConnectionId conn_id, const std::string& username, std::string& out_err);
    void unregister_user(ConnectionId conn_id);

    // Lookups
    std::optional<std::string> get_username(ConnectionId conn_id) const;
    std::optional<ConnectionId> get_connection_id(const std::string& username) const;
    std::optional<std::string> get_user_room(ConnectionId conn_id) const;

    // Room operations
    bool join_room(ConnectionId conn_id, const std::string& room_name, std::string& out_prev_room);
    bool leave_room(ConnectionId conn_id, std::string& out_left_room);

    // Broadcast target retrieval
    // Returns list of connection IDs in the same room as the sender (excluding sender if requested)
    std::vector<ConnectionId> get_room_members(const std::string& room_name, ConnectionId exclude_id = -1) const;

    // Returns all active connection IDs across all rooms (excluding sender if requested)
    std::vector<ConnectionId> get_all_members(ConnectionId exclude_id = -1) const;

    // Discovery lists
    struct RoomSummary {
        std::string name;
        size_t user_count;
    };
    std::vector<RoomSummary> list_rooms() const;
    std::vector<std::string> list_users_in_room(const std::string& room_name) const;
    std::vector<std::string> list_all_users() const;

    // Total counts
    size_t active_user_count() const;
    size_t active_room_count() const;

private:
    mutable std::shared_mutex mutex_;

    // conn_id -> UserInfo
    std::unordered_map<ConnectionId, UserInfo> users_by_id_;

    // normalized lowercase username -> conn_id
    std::unordered_map<std::string, ConnectionId> users_by_name_;

    // room_name -> RoomInfo
    std::unordered_map<std::string, RoomInfo> rooms_;

    static std::string normalize_name(const std::string& name);
};

} // namespace pulsechat
