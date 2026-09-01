#!/bin/sh

echo "[STARTUP] Starting PulseChat C++ epoll Reactor Server on 0.0.0.0:9000..."
/app/build/pulsechat_reactor &
REACTOR_PID=$!
echo "[STARTUP] C++ Reactor PID: $REACTOR_PID"

sleep 1

echo "[STARTUP] Starting PulseChat Node.js Gateway on port ${PORT:-3001}..."
cd /app/gateway
exec node dist/server.js
