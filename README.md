# PulseChat — High-Concurrency TCP/IP Chat Server & Web Console

[![C++17](https://img.shields.io/badge/C%2B%2B-17-blue.svg)](https://en.cppreference.com/w/cpp/17)
[![Linux](https://img.shields.io/badge/Platform-Linux-orange.svg)](https://www.kernel.org/)
[![React](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-61dafb.svg)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Gateway-Node.js%20%2B%20TypeScript-339933.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**PulseChat** is a production-quality, low-level Linux systems programming project in **C++17** demonstrating POSIX networking, custom binary application-layer framing, thread synchronization, and high-concurrency event-driven architecture, connected to a modern dark **React + TypeScript Web UI** with **Google OAuth2 Identity** via a high-performance **Node.js WebSocket-to-TCP Gateway**.

---

## System Architecture

```text
  ┌─────────────────────────────────────────────────────────────┐
  │                    Browser Web UI (React + TS + Vite)       │
  │     - Dark Systems-Engineering Aesthetic (Charcoal/Cyan)    │
  │     - Google OAuth 2.0 Identity & Session Persistence       │
  │     - Left Sidebar: Rooms, Online Users, Live Presence      │
  │     - Center: Chat Feed, Timestamps, Slash Commands, Input  │
  │     - Right Panel: Real-time Observability & Telemetry Gauges│
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                   WebSocket (JSON Frames / WS)
                                 │
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                Node.js + TypeScript Gateway (Port 3001)     │
  │     - Dedicated TCP Socket per WebSocket client             │
  │     - PCAP Binary Framer & Parser (1B type + 4B length BE)  │
  │     - Metrics Poller (Requests 0x0D from C++ Server)        │
  │     - Broadcasts live server telemetry & raw PCAP frames    │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                   TCP Socket (PCAP Binary Stream)
                                 │
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │             C++ PulseChat Reactor Server (Port 9000)        │
  │     - Linux epoll non-blocking event loop                   │
  │     - Room management, user registry, message routing       │
  │     - Real-time atomic metrics collection                   │
  └─────────────────────────────────────────────────────────────┘
```

---

## Key Features

- **Binary Framed Application Protocol (PCAP)**: 5-byte header (`[TYPE: 1B] [LENGTH: 4B Big-Endian] [PAYLOAD: N bytes]`) preventing TCP stream fragmentation and packet sticking.
- **Defragmentation & Sliding Buffer**: Custom `ByteBuffer` handles partial reads, partial writes (`EAGAIN`), and multiple concatenated frames within single network packets.
- **Dual Server Architectures**:
  - `pulsechat_classic`: Multi-threaded blocking I/O (1 thread per client).
  - `pulsechat_reactor`: Single-threaded event loop driven by Linux **`epoll`** and non-blocking sockets.
- **Full-Featured Web UI (React + Vite + Tailwind)**:
  - Genuine **Google OAuth2 Sign-In** with verified avatar and email.
  - Persistent chat history and session restore on page refresh (like Discord).
  - Channel rooms (`#general`, `#engineering`, `#gaming`) & room creation.
  - Online users list with 1-click private messaging (`/msg`).
  - Real-time Observability Panel showing active connections, throughput, messages/sec, room distributions, and live raw PCAP frame traffic.
- **WebSocket-to-TCP Gateway (Node.js + TypeScript)**:
  - Bridges browser WebSockets 1-to-1 to low-level POSIX TCP sockets over binary PCAP frames.
  - Polls live telemetry from the C++ server via `0x0D GET_METRICS`.
- **Python Load Testing Suite (`tools/load_test.py`)**: Asyncio load generator measuring connection rates, throughput, and latency percentiles (P50, P95, P99).

---

## Wire Protocol (PCAP)

```text
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   TYPE (1B)   |           PAYLOAD LENGTH (4B, Big-Endian)     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        PAYLOAD DATA...                        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

| Opcode | Identifier | Description |
|---|---|---|
| `0x01` | `CHAT_MESSAGE` | Broadcast room chat message |
| `0x02` | `JOIN_ROOM` | Join/create a chat room |
| `0x03` | `LEAVE_ROOM` | Leave room and return to `#general` |
| `0x04` | `PRIVATE_MESSAGE` | Direct message formatted as `target:text` |
| `0x05` | `HEARTBEAT` | Heartbeat keepalive probe (`PING`) |
| `0x06` | `HEARTBEAT_ACK` | Heartbeat response (`PONG`) |
| `0x07` | `USER_REGISTER` | Handshake to register unique username |
| `0x08` | `SERVER_NOTIFICATION` | System join/leave/broadcast announcements |
| `0x09` | `LIST_ROOMS` | Request list of active chat rooms |
| `0x0A` | `LIST_USERS` | Request list of connected users |
| `0x0B` | `ERROR_RESPONSE` | Error and rejection notifications |
| `0x0C` | `DISCONNECT` | Clean client disconnect notice |
| `0x0D` | `GET_METRICS` | Request real-time server telemetry |
| `0x0E` | `METRICS_UPDATE` | Telemetry response with JSON payload |

---

## How to Run the Full Stack

### Step 1: Build and Run C++ Reactor Server
In Terminal 1 (Linux / WSL):
```bash
cd pulsechat
mkdir -p build && cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
make -j$(nproc)

./pulsechat_reactor --port 9000
```

### Step 2: Start Node.js Gateway
In Terminal 2:
```bash
cd pulsechat/gateway
npm install
npm run dev
```
*The Gateway starts on `http://localhost:3001` and connects to `127.0.0.1:9000`.*

### Step 3: Configure and Start React Frontend
In Terminal 3:
```bash
cd pulsechat/frontend
cp .env.example .env
```
Edit `.env` to set your Google OAuth Client ID:
```env
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_WS_URL=ws://localhost:3001
```

Then install dependencies and start the UI:
```bash
npm install
npm run dev
```
*Open `http://localhost:5173` in your browser.*

---

## Running the Terminal Client & Load Testing

You can still use the C++ CLI client and Python benchmark tools concurrently with the Web UI:

```bash
# C++ Terminal Client:
./build/pulsechat_client --port 9000 --user Alice

# Automated Integration Suite:
python3 tools/quick_test.py 127.0.0.1 9000

# High-Concurrency Load Tester:
python3 tools/load_test.py --clients 200 --messages 2000 --rooms 5
```

---

## License

Distributed under the MIT License.
