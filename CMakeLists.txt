cmake_minimum_required(VERSION 3.14)
project(PulseChat VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Compiler flags
if (CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
    add_compile_options(-Wall -Wextra -pedantic -O3 -pthread)
endif()

# Include directories
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/include)

# Threading library
find_package(Threads REQUIRED)

# 1. Core shared static library
add_library(pulsechat_core STATIC
    src/core/protocol.cpp
    src/core/buffer.cpp
    src/core/room_manager.cpp
    src/core/metrics.cpp
)
target_include_directories(pulsechat_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
target_link_libraries(pulsechat_core PUBLIC Threads::Threads)

# 2. Version 1: PulseChat Classic (Thread-per-Client Server)
add_executable(pulsechat_classic
    src/classic/classic_server.cpp
    src/classic/main_classic.cpp
)
target_include_directories(pulsechat_classic PRIVATE src/classic)
target_link_libraries(pulsechat_classic PRIVATE pulsechat_core Threads::Threads)

# 3. Version 2: PulseChat Reactor (epoll Event-Driven Server)
add_executable(pulsechat_reactor
    src/reactor/epoll_dispatcher.cpp
    src/reactor/reactor_connection.cpp
    src/reactor/reactor_server.cpp
    src/reactor/main_reactor.cpp
)
target_include_directories(pulsechat_reactor PRIVATE src/reactor)
target_link_libraries(pulsechat_reactor PRIVATE pulsechat_core Threads::Threads)

# 4. Interactive Terminal Client
add_executable(pulsechat_client
    src/client/client_main.cpp
)
target_link_libraries(pulsechat_client PRIVATE pulsechat_core Threads::Threads)

# Output summary
message(STATUS "--------------------------------------------------------")
message(STATUS " PulseChat High-Concurrency TCP/IP Server Configuration ")
message(STATUS " Target C++ Standard: C++${CMAKE_CXX_STANDARD}")
message(STATUS " Targets:")
message(STATUS "   - pulsechat_core    (Shared domain & protocol library)")
message(STATUS "   - pulsechat_classic (Thread-per-client server)")
message(STATUS "   - pulsechat_reactor (epoll Reactor event-loop server)")
message(STATUS "   - pulsechat_client  (Interactive CLI client)")
message(STATUS "--------------------------------------------------------")
