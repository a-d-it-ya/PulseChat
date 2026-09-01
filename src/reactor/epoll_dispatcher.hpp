#pragma once

#include "pulsechat/common.hpp"
#include <sys/epoll.h>
#include <vector>
#include <stdexcept>

namespace pulsechat {

class EpollDispatcher {
public:
    explicit EpollDispatcher(int max_events = 1024);
    ~EpollDispatcher();

    // Prevent copying
    EpollDispatcher(const EpollDispatcher&) = delete;
    EpollDispatcher& operator=(const EpollDispatcher&) = delete;

    bool add_fd(int fd, uint32_t events, void* ptr = nullptr);
    bool mod_fd(int fd, uint32_t events, void* ptr = nullptr);
    bool del_fd(int fd);

    // Waits for epoll events up to timeout_ms
    int wait(int timeout_ms);

    const epoll_event& get_event(size_t index) const;
    size_t event_count() const;

private:
    int epoll_fd_{-1};
    int max_events_{1024};
    std::vector<epoll_event> events_;
    int ready_count_{0};
};

} // namespace pulsechat
