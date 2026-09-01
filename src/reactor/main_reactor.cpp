#include "reactor_server.hpp"
#include <csignal>
#include <iostream>
#include <string>

static pulsechat::ReactorServer* g_reactor_server = nullptr;

void signal_handler(int sig) {
    std::cout << "\nCaught signal " << sig << ", shutting down PulseChat Reactor Server..." << std::endl;
    if (g_reactor_server) {
        g_reactor_server->stop();
    }
}

int main(int argc, char* argv[]) {
    uint16_t port = pulsechat::DEFAULT_PORT;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if ((arg == "-p" || arg == "--port") && i + 1 < argc) {
            port = static_cast<uint16_t>(std::stoi(argv[++i]));
        } else if (arg == "-h" || arg == "--help") {
            std::cout << "Usage: pulsechat_reactor [options]\n"
                      << "Options:\n"
                      << "  -p, --port <port>   Port to listen on (default: " << pulsechat::DEFAULT_PORT << ")\n"
                      << "  -h, --help          Show help message\n";
            return 0;
        }
    }

    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);
    std::signal(SIGPIPE, SIG_IGN); // Ignore SIGPIPE for robust socket writes

    pulsechat::ReactorServer server(port);
    g_reactor_server = &server;

    std::cout << "=========================================================\n"
              << "     PulseChat Reactor Server (epoll Event-Driven)       \n"
              << "=========================================================\n";

    if (!server.start()) {
        std::cerr << "Failed to start reactor server on port " << port << std::endl;
        return 1;
    }

    server.run();
    return 0;
}
