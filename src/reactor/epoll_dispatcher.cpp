#include "epoll_dispatcher.hpp"
#include <unistd.h>
#include <cstring>

namespace pulsechat {

EpollDispatcher::EpollDispatcher(int max_events)
    : max_events_(max_events), events_(max_events) {
    epoll_fd_ = ::epoll_create1(EPOLL_CLOEXEC);
    if (epoll_fd_ < 0) {
        LOG_ERROR("epoll_create1 failed");
    }
}

EpollDispatcher::~EpollDispatcher() {
    if (epoll_fd_ >= 0) {
        ::close(epoll_fd_);
        epoll_fd_ = -1;
    }
}

bool EpollDispatcher::add_fd(int fd, uint32_t events, void* ptr) {
    if (epoll_fd_ < 0 || fd < 0) return false;

    epoll_event ev{};
    ev.events = events;
    if (ptr) {
        ev.data.ptr = ptr;
    } else {
        ev.data.fd = fd;
    }

    if (::epoll_ctl(epoll_fd_, EPOLL_CTL_ADD, fd, &ev) < 0) {
        LOG_ERROR("epoll_ctl ADD failed for fd=" << fd);
        return false;
    }
    return true;
}

bool EpollDispatcher::mod_fd(int fd, uint32_t events, void* ptr) {
    if (epoll_fd_ < 0 || fd < 0) return false;

    epoll_event ev{};
    ev.events = events;
    if (ptr) {
        ev.data.ptr = ptr;
    } else {
        ev.data.fd = fd;
    }

    if (::epoll_ctl(epoll_fd_, EPOLL_CTL_MOD, fd, &ev) < 0) {
        LOG_ERROR("epoll_ctl MOD failed for fd=" << fd);
        return false;
    }
    return true;
}

bool EpollDispatcher::del_fd(int fd) {
    if (epoll_fd_ < 0 || fd < 0) return false;

    if (::epoll_ctl(epoll_fd_, EPOLL_CTL_DEL, fd, nullptr) < 0) {
        return false;
    }
    return true;
}

int EpollDispatcher::wait(int timeout_ms) {
    if (epoll_fd_ < 0) return -1;
    ready_count_ = ::epoll_wait(epoll_fd_, events_.data(), max_events_, timeout_ms);
    return ready_count_;
}

const epoll_event& EpollDispatcher::get_event(size_t index) const {
    return events_[index];
}

size_t EpollDispatcher::event_count() const {
    return ready_count_ > 0 ? static_cast<size_t>(ready_count_) : 0;
}

} // namespace pulsechat
