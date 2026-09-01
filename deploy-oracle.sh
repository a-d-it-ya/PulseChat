#!/usr/bin/env bash
set -e

echo "=================================================="
echo "⚡ PulseChat Oracle Cloud 24/7 Automated Installer"
echo "=================================================="

# 1. Update system & install dependencies
sudo apt-get update -y
sudo apt-get install -y build-essential cmake git curl ufw

# 2. Install Node.js 20 LTS (if not present)
if ! command -v node &> /dev/null; then
    echo "[1/5] Installing Node.js LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# 3. Configure Firewall (UFW & iptables)
echo "[2/5] Configuring firewall rules for Ports 9000 (TCP) & 3001 (Gateway)..."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 9000 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3001 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true

# 4. Build C++ epoll Reactor Server
echo "[3/5] Building C++ Reactor Server with native Linux epoll..."
cmake -B build -S . -DCMAKE_BUILD_TYPE=Release
cmake --build build -j$(nproc)

# 5. Build & Setup Node.js Gateway
echo "[4/5] Building Node.js WebSocket Gateway..."
cd gateway
npm install
npm run build || true
cd ..

# 6. Create Systemd 24/7 Background Services
echo "[5/5] Creating 24/7 Systemd Background Services..."

# Service 1: C++ Server
cat <<EOF | sudo tee /etc/systemd/system/pulsechat-server.service
[Unit]
Description=PulseChat C++ epoll Reactor Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(pwd)/build/pulsechat_reactor
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# Service 2: Gateway
cat <<EOF | sudo tee /etc/systemd/system/pulsechat-gateway.service
[Unit]
Description=PulseChat Node.js Gateway
After=network.target pulsechat-server.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)/gateway
ExecStart=$(which node) $(pwd)/gateway/dist/server.js
Environment=NODE_ENV=production
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# Reload & Start Services
sudo systemctl daemon-reload
sudo systemctl enable pulsechat-server pulsechat-gateway
sudo systemctl restart pulsechat-server pulsechat-gateway

echo ""
echo "=================================================="
echo "🎉 PulseChat is now running 24/7 on your Oracle VM!"
echo "=================================================="
echo "Status Commands:"
echo "  sudo systemctl status pulsechat-server"
echo "  sudo systemctl status pulsechat-gateway"
echo "=================================================="
