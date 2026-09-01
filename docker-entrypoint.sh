#!/bin/sh
set -e

echo "[STARTUP] Starting PulseChat C++ epoll Reactor Server on 0.0.0.0:9000..."
/app/build/pulsechat_reactor &
REACTOR_PID=$!

# Wait for C++ server to bind port 9000
sleep 1

echo "[STARTUP] Starting PulseChat Node.js WebSocket Gateway on port ${PORT:-3001}..."
cd /app/gateway
node dist/server.js &
GATEWAY_PID=$!

# Forward kill signals to child processes
trap "kill -TERM $REACTOR_PID $GATEWAY_PID; exit 0" SIGINT SIGTERM

wait -n $REACTOR_PID $GATEWAY_PID
