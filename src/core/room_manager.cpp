#include "pulsechat/room_manager.hpp"
#include <algorithm>
#include <cctype>

namespace pulsechat {

RoomManager::RoomManager() {
    // Initialize default general room
    rooms_["general"] = RoomInfo{"general", {}};
}

std::string RoomManager::normalize_name(const std::string& name) {
    std::string norm = name;
    std::transform(norm.begin(), norm.end(), norm.begin(),
                   [](unsigned char c) { return std::tolower(c); });
    return norm;
}

bool RoomManager::register_user(ConnectionId conn_id, const std::string& username, std::string& out_err) {
    if (username.empty()) {
        out_err = "Username cannot be empty";
        return false;
    }
    if (username.size() > 32) {
        out_err = "Username cannot exceed 32 characters";
        return false;
    }
    for (char c : username) {
        if (!std::isalnum(static_cast<unsigned char>(c)) && c != '_' && c != '-') {
            out_err = "Username contains invalid characters (use letters, numbers, _, -)";
            return false;
        }
    }

    std::unique_lock<std::shared_mutex> lock(mutex_);

    std::string norm = normalize_name(username);
    if (users_by_name_.find(norm) != users_by_name_.end()) {
        out_err = "Username '" + username + "' is already taken";
        return false;
    }

    // Check if conn_id already had a user registered
    auto it = users_by_id_.find(conn_id);
    if (it != users_by_id_.end()) {
        // Unregister previous name
        users_by_name_.erase(normalize_name(it->second.username));
    }

    UserInfo info;
    info.conn_id = conn_id;
    info.username = username;
    info.current_room = "general";
    info.last_active = std::chrono::steady_clock::now();

    users_by_id_[conn_id] = info;
    users_by_name_[norm] = conn_id;

    // Add to general room
    rooms_["general"].members.insert(conn_id);

    return true;
}

void RoomManager::unregister_user(ConnectionId conn_id) {
    std::unique_lock<std::shared_mutex> lock(mutex_);

    auto it = users_by_id_.find(conn_id);
    if (it == users_by_id_.end()) return;

    std::string norm = normalize_name(it->second.username);
    std::string current_room = it->second.current_room;

    users_by_name_.erase(norm);

    auto room_it = rooms_.find(current_room);
    if (room_it != rooms_.end()) {
        room_it->second.members.erase(conn_id);
        // Clean up empty room if not default "general"
        if (room_it->second.members.empty() && current_room != "general") {
            rooms_.erase(room_it);
        }
    }

    users_by_id_.erase(it);
}

std::optional<std::string> RoomManager::get_username(ConnectionId conn_id) const {
    std::shared_lock<std::shared_mutex> lock(mutex_);
    auto it = users_by_id_.find(conn_id);
    if (it != users_by_id_.end()) {
        return it->second.username;
    }
    return std::nullopt;
}

std::optional<ConnectionId> RoomManager::get_connection_id(const std::string& username) const {
    std::shared_lock<std::shared_mutex> lock(mutex_);
    auto it = users_by_name_.find(normalize_name(username));
    if (it != users_by_name_.end()) {
        return it->second;
    }
    return std::nullopt;
}

std::optional<std::string> RoomManager::get_user_room(ConnectionId conn_id) const {
    std::shared_lock<std::shared_mutex> lock(mutex_);
    auto it = users_by_id_.find(conn_id);
    if (it != users_by_id_.end()) {
        return it->second.current_room;
    }
    return std::nullopt;
}

bool RoomManager::join_room(ConnectionId conn_id, const std::string& room_name, std::string& out_prev_room) {
    if (room_name.empty() || room_name.size() > 32) {
        return false;
    }

    std::unique_lock<std::shared_mutex> lock(mutex_);
    auto it = users_by_id_.find(conn_id);
    if (it == users_by_id_.end()) {
        return false;
    }

    out_prev_room = it->second.current_room;
    if (out_prev_room == room_name) {
        return true; // already in room
    }

    // Remove from current room
    auto prev_it = rooms_.find(out_prev_room);
    if (prev_it != rooms_.end()) {
        prev_it->second.members.erase(conn_id);
        if (prev_it->second.members.empty() && out_prev_room != "general") {
            rooms_.erase(prev_it);
        }
    }

    // Add to new room
    rooms_[room_name].name = room_name;
    rooms_[room_name].members.insert(conn_id);
    it->second.current_room = room_name;

    return true;
}

bool RoomManager::leave_room(ConnectionId conn_id, std::string& out_left_room) {
    std::unique_lock<std::shared_mutex> lock(mutex_);
    auto it = users_by_id_.find(conn_id);
    if (it == users_by_id_.end()) return false;

    out_left_room = it->second.current_room;
    if (out_left_room == "general") {
        return false; // Can't leave default general room
    }

    auto prev_it = rooms_.find(out_left_room);
    if (prev_it != rooms_.end()) {
        prev_it->second.members.erase(conn_id);
        if (prev_it->second.members.empty()) {
            rooms_.erase(prev_it);
        }
    }

    // Move back to general
    rooms_["general"].members.insert(conn_id);
    it->second.current_room = "general";
    return true;
}

std::vector<ConnectionId> RoomManager::get_room_members(const std::string& room_name, ConnectionId exclude_id) const {
    std::shared_lock<std::shared_mutex> lock(mutex_);
    std::vector<ConnectionId> result;
    auto it = rooms_.find(room_name);
    if (it != rooms_.end()) {
        result.reserve(it->second.members.size());
        for (ConnectionId cid : it->second.members) {
            if (cid != exclude_id) {
                result.push_back(cid);
            }
        }
    }
    return result;
}

std::vector<ConnectionId> RoomManager::get_all_members(ConnectionId exclude_id) const {
    std::shared_lock<std::shared_mutex> lock(mutex_);
    std::vector<ConnectionId> result;
    result.reserve(users_by_id_.size());
    for (const auto& [cid, _] : users_by_id_) {
        if (cid != exclude_id) {
            result.push_back(cid);
        }
    }
    return result;
}

std::vector<RoomManager::RoomSummary> RoomManager::list_rooms() const {
    std::shared_lock<std::shared_mutex> lock(mutex_);
    std::vector<RoomSummary> list;
    list.reserve(rooms_.size());
    for (const auto& [name, rinfo] : rooms_) {
        list.push_back({name, rinfo.members.size()});
    }
    return list;
}

std::vector<std::string> RoomManager::list_users_in_room(const std::string& room_name) const {
    std::shared_lock<std::shared_mutex> lock(mutex_);
    std::vector<std::string> list;
    auto it = rooms_.find(room_name);
    if (it != rooms_.end()) {
        for (ConnectionId cid : it->second.members) {
            auto user_it = users_by_id_.find(cid);
            if (user_it != users_by_id_.end()) {
                list.push_back(user_it->second.username);
            }
        }
    }
    return list;
}

std::vector<std::string> RoomManager::list_all_users() const {
    std::shared_lock<std::shared_mutex> lock(mutex_);
    std::vector<std::string> list;
    list.reserve(users_by_id_.size());
    for (const auto& [_, uinfo] : users_by_id_) {
        list.push_back(uinfo.username + " (" + uinfo.current_room + ")");
    }
    return list;
}

size_t RoomManager::active_user_count() const {
    std::shared_lock<std::shared_mutex> lock(mutex_);
    return users_by_id_.size();
}

size_t RoomManager::active_room_count() const {
    std::shared_lock<std::shared_mutex> lock(mutex_);
    return rooms_.size();
}

} // namespace pulsechat
