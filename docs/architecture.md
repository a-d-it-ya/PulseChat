# PulseChat Architecture Deep-Dive

PulseChat implements and contrasts two major networking architectures in systems programming, complemented by an event-driven Web Gateway and modern React UI:
1. **PulseChat Classic**: Thread-per-Client Blocking I/O Model.
2. **PulseChat Reactor**: Single-Threaded Event-Driven Non-Blocking I/O Model with Linux `epoll`.
3. **PulseChat Web Gateway**: Node.js + TypeScript bridging WebSocket clients 1-to-1 to POSIX TCP sockets over PCAP binary frames.
4. **PulseChat Web UI**: React + TypeScript + Vite dark systems-engineering console with real-time observability telemetry.

---

## 1. Full-Stack System Architecture

```text
  ┌─────────────────────────────────────────────────────────────┐
  │                    Browser Web UI (React + TS + Vite)       │
  │     - Dark Systems-Engineering Aesthetic (Charcoal/Cyan)    │
  │     - Left Sidebar: Rooms & Online Users List               │
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

## 2. Version 1: PulseChat Classic (Thread-per-Client)

### Concurrency Model
- The main thread runs an `accept()` loop on a blocking listening socket.
- For each accepted client connection, a dedicated worker thread `std::thread(&ClassicServer::client_handler, ...)` is spawned.
- The worker thread executes a blocking `recv()` loop, feeding received chunks into the client's `ByteBuffer`.
- When a broadcast is sent, the sender thread iterates over target socket file descriptors and calls `send()`.

### Synchronization & Safety
- **Registry & Rooms**: Protected by `std::shared_mutex` (reader-writer lock) via `std::shared_lock` for read-heavy room lookups and `std::unique_lock` for join/leave/register mutations.
- **Client Write Serialization**: Each client context maintains an independent `std::mutex` for socket writes (`send_mutex`). This prevents concurrent threads broadcasting to the same room from interleaving bytes on a client's TCP socket.

---

## 3. Version 2: PulseChat Reactor (Event-Driven with epoll)

### Concurrency Model
- Uses non-blocking sockets (`O_NONBLOCK`) and the Linux `epoll` kernel subsystem (`epoll_create1`, `epoll_ctl`, `epoll_wait`).
- A single thread drives the entire server:
  1. `epoll_wait()` sleeps until one or more file descriptors are ready for I/O.
  2. If `listen_fd` is ready (`EPOLLIN`): accepts all pending incoming connections until `accept()` returns `EAGAIN`.
  3. If client socket is ready for reading (`EPOLLIN`): reads chunks in a loop until `recv()` returns `EAGAIN`, processes complete protocol frames, and queues outbound responses.
  4. If client socket is ready for writing (`EPOLLOUT`): flushes queued outbound buffers. If buffers empty completely, modifies epoll interest to remove `EPOLLOUT`.
  5. If socket experiences error or disconnect (`EPOLLRDHUP | EPOLLERR | EPOLLHUP`): cleans up connection and notifies room members.

---

## 4. WebSocket-to-TCP Gateway Architecture

The Gateway operates as a high-throughput bridge between web browsers and the low-level POSIX TCP server:
- **1-to-1 Socket Multiplexing**: Every connected browser WebSocket triggers the creation of a dedicated `net.Socket` connection to `127.0.0.1:9000`.
- **PCAP Binary Codec**: Translates incoming high-level WebSocket commands into binary PCAP frames (`[1B opcode][4B length BE][payload]`) and parses raw TCP chunks back into typed frames.
- **Admin Telemetry Poller**: Automatically polls `0x0D GET_METRICS` every 1.5s from the C++ server and broadcasts live telemetry updates to all UI clients.
