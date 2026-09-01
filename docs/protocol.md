# PulseChat Application-Layer Protocol (PCAP)

The PulseChat Application Protocol (PCAP) is a binary, length-prefixed framed protocol designed to operate reliably over continuous TCP byte streams. It guarantees clean message delineation, prevents TCP packet sticking/fragmentation issues, and supports arbitrary payloads up to 64 KB.

---

## 1. Frame Layout

Every message sent across the wire starts with a fixed 5-byte header followed by variable-length payload bytes:

```text
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   TYPE (1B)   |           PAYLOAD LENGTH (4B, Big-Endian)     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
+                        PAYLOAD DATA (N bytes)                 +
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

### Fields:
1. **`TYPE` (1 Byte, `uint8_t`)**: Specifies the opcode/message command type.
2. **`PAYLOAD LENGTH` (4 Bytes, `uint32_t`)**: The exact size of the payload in bytes encoded in Network Byte Order (Big-Endian via `htonl`/`ntohl`).
3. **`PAYLOAD DATA` (`N` Bytes)**: Raw data encoded as UTF-8 string or structured JSON.

---

## 2. Message Types & Opcodes

| Opcode (Hex) | Enumeration | Direction | Payload Schema | Description |
|---|---|---|---|---|
| `0x01` | `CHAT_MESSAGE` | Bidirectional | `UTF-8 String` | Chat message. Server broadcasts to room members. |
| `0x02` | `JOIN_ROOM` | Client -> Server | `room_name` (UTF-8) | Request to switch/join a chat room. |
| `0x03` | `LEAVE_ROOM` | Client -> Server | Optional room name | Leave current room and return to `#general`. |
| `0x04` | `PRIVATE_MESSAGE` | Bidirectional | `target_user:message` | Direct 1-to-1 message to a specific user. |
| `0x05` | `HEARTBEAT` | Client -> Server | Timestamp / "PING" | Keepalive probe sent periodically (every 10s). |
| `0x06` | `HEARTBEAT_ACK` | Server -> Client | "PONG" | Response to heartbeat probe. |
| `0x07` | `USER_REGISTER` | Client -> Server | `username` (UTF-8) | Initial handshake to claim unique username. |
| `0x08` | `SERVER_NOTIFICATION`| Server -> Client | `notification` (UTF-8) | Join/leave notifications, MOTD, room events. |
| `0x09` | `LIST_ROOMS` | Client -> Server | Optional filter | Requests list of active rooms and member counts. |
| `0x0A` | `LIST_USERS` | Client -> Server | Optional filter | Requests list of online registered users. |
| `0x0B` | `ERROR_RESPONSE` | Server -> Client | `error_description` | Validation failure, duplicate name, or error. |
| `0x0C` | `DISCONNECT` | Client -> Server | Optional reason | Graceful disconnection notice. |
| `0x0D` | `GET_METRICS` | Gateway -> Server | Empty / Filter | Request real-time server telemetry snapshot. |
| `0x0E` | `METRICS_UPDATE` | Server -> Gateway | JSON Payload | Telemetry snapshot containing active connections, rates, uptime, and room distributions. |

---

## 3. Telemetry JSON Schema (`0x0E METRICS_UPDATE`)

```json
{
  "uptime_sec": 142.5,
  "active_connections": 12,
  "total_connections": 45,
  "messages_received": 1250,
  "messages_sent": 8420,
  "bytes_received": 78400,
  "bytes_sent": 425100,
  "msgs_per_sec": 84.2,
  "bytes_per_sec": 14200.5,
  "rooms": [
    { "name": "general", "users": 8 },
    { "name": "engineering", "users": 4 }
  ]
}
```

---

## 4. TCP Stream Handling & Frame State Machine

Because TCP delivers an unbroken stream of bytes with arbitrary segmentation:
1. **Partial Reads**: If `recv()` returns fewer than 5 bytes, the server buffers the bytes and waits for the next `EPOLLIN` or blocking read.
2. **Incomplete Payloads**: If `readable_bytes < 5 + length`, the frame header is preserved and the server waits for subsequent chunks.
3. **Concatenated Messages**: If a single `recv()` contains multiple frames, the `ByteBuffer` parses and consumes each frame sequentially in a loop.
4. **Memory Compaction**: When reading advances past the halfway mark of the buffer, remaining unparsed bytes are compacted using `memmove()` to keep contiguous memory available for future reads.
