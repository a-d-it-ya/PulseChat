#!/usr/bin/env python3
"""
PulseChat Functional Integration Test Suite
Verifies:
1. Registration & Duplicate username rejection
2. Room switching & isolated broadcasts
3. Private direct messaging
4. TCP stream fragmentation (1-byte chunk delivery)
5. Multiple concatenated frames in a single TCP packet
"""

import socket
import struct
import time
import sys

MSG_CHAT_MESSAGE        = 0x01
MSG_JOIN_ROOM           = 0x02
MSG_LEAVE_ROOM          = 0x03
MSG_PRIVATE_MESSAGE     = 0x04
MSG_HEARTBEAT           = 0x05
MSG_HEARTBEAT_ACK       = 0x06
MSG_USER_REGISTER       = 0x07
MSG_SERVER_NOTIFICATION = 0x08
MSG_LIST_ROOMS          = 0x09
MSG_LIST_USERS          = 0x0A
MSG_ERROR_RESPONSE      = 0x0B
MSG_DISCONNECT          = 0x0C

HEADER_STRUCT = struct.Struct("!BI")

def encode_frame(msg_type: int, payload: str) -> bytes:
    p = payload.encode('utf-8')
    return HEADER_STRUCT.pack(msg_type, len(p)) + p

class TestClient:
    def __init__(self, host="127.0.0.1", port=9000):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.connect((host, port))
        self.sock.settimeout(2.0)
        self.buf = bytearray()

    def send(self, frame: bytes):
        self.sock.sendall(frame)

    def send_fragmented(self, frame: bytes, chunk_size=1):
        """Sends data byte-by-byte to test buffer reassembly."""
        for i in range(0, len(frame), chunk_size):
            self.sock.sendall(frame[i:i+chunk_size])
            time.sleep(0.002)

    def recv_message(self):
        start = time.time()
        while time.time() - start < 3.0:
            while len(self.buf) >= 5:
                mtype, length = HEADER_STRUCT.unpack_from(self.buf, 0)
                if len(self.buf) >= 5 + length:
                    payload = self.buf[5:5+length].decode('utf-8')
                    del self.buf[:5+length]
                    return mtype, payload
            try:
                data = self.sock.recv(4096)
                if not data:
                    break
                self.buf.extend(data)
            except socket.timeout:
                break
        return None, None

    def close(self):
        try:
            self.sock.close()
        except Exception:
            pass

def test_suite(host="127.0.0.1", port=9000):
    print(f"=== Running PulseChat Integration Test Suite on {host}:{port} ===")

    # Test 1: User Registration & Welcome
    print("[TEST 1] Registering Alice...")
    c1 = TestClient(host, port)
    c1.send(encode_frame(MSG_USER_REGISTER, "Alice"))
    t, p = c1.recv_message()
    assert t == MSG_SERVER_NOTIFICATION and "Welcome" in p, f"Failed registration: {t}, {p}"
    print("  PASS: Alice registered.")

    # Test 2: Duplicate Registration Rejection
    print("[TEST 2] Duplicate registration check...")
    c2 = TestClient(host, port)
    c2.send(encode_frame(MSG_USER_REGISTER, "Alice"))
    t, p = c2.recv_message()
    assert t == MSG_ERROR_RESPONSE and "already taken" in p, f"Failed duplicate reject: {t}, {p}"
    c2.close()
    print("  PASS: Duplicate username correctly rejected.")

    # Register Bob
    c2 = TestClient(host, port)
    c2.send(encode_frame(MSG_USER_REGISTER, "Bob"))
    t, p = c2.recv_message()
    assert t == MSG_SERVER_NOTIFICATION and "Welcome" in p
    # Alice receives Bob joined notification
    t, p = c1.recv_message()
    assert t == MSG_SERVER_NOTIFICATION and "Bob joined" in p
    print("  PASS: Bob registered, Alice received join notification.")

    # Test 3: Chat in #general
    print("[TEST 3] General chat broadcast...")
    c1.send(encode_frame(MSG_CHAT_MESSAGE, "Hello World from Alice"))
    # Alice receives her own broadcast
    t1, p1 = c1.recv_message()
    # Bob receives broadcast
    t2, p2 = c2.recv_message()
    assert "Hello World from Alice" in p1 and "Hello World from Alice" in p2
    print("  PASS: General chat broadcast delivered to all room members.")

    # Test 4: Room Isolation
    print("[TEST 4] Room isolation test...")
    c1.send(encode_frame(MSG_JOIN_ROOM, "engineering"))
    # Alice receives join confirmation
    t, p = c1.recv_message()
    assert "joined room #engineering" in p
    # Bob receives notification that Alice left
    t, p = c2.recv_message()

    # Bob speaks in #general
    c2.send(encode_frame(MSG_CHAT_MESSAGE, "Message for general only"))
    t, p = c2.recv_message()
    assert "Message for general only" in p
    # Alice should NOT receive this message since she is in #engineering
    t_alice, _ = c1.recv_message()
    assert t_alice is None, "FAIL: Alice should not have received general room message!"
    print("  PASS: Room isolation strictly enforced.")

    # Test 5: Private Direct Message
    print("[TEST 5] Private direct messaging (/msg)...")
    c1.send(encode_frame(MSG_PRIVATE_MESSAGE, "Bob:Secret message for Bob"))
    # Alice gets confirmation DM
    t_a, p_a = c1.recv_message()
    assert "[DM to Bob]" in p_a
    # Bob gets DM
    t_b, p_b = c2.recv_message()
    assert "[DM from Alice]: Secret message for Bob" in p_b
    print("  PASS: Private message routed accurately across rooms.")

    # Test 6: Fragmented TCP Stream
    print("[TEST 6] Fragmented TCP stream handling (byte-by-byte)...")
    frag_msg = encode_frame(MSG_CHAT_MESSAGE, "Defragmented message content")
    c1.send_fragmented(frag_msg, chunk_size=1)
    t, p = c1.recv_message()
    assert t == MSG_CHAT_MESSAGE and "Defragmented message content" in p
    print("  PASS: 1-byte fragmented frame successfully assembled and parsed.")

    # Test 7: Multiple Concatenated Frames in single send()
    print("[TEST 7] Multiple concatenated frames in single packet...")
    multi_data = (encode_frame(MSG_CHAT_MESSAGE, "Packet1") +
                  encode_frame(MSG_CHAT_MESSAGE, "Packet2") +
                  encode_frame(MSG_CHAT_MESSAGE, "Packet3"))
    c1.send(multi_data)
    for expected in ["Packet1", "Packet2", "Packet3"]:
        t, p = c1.recv_message()
        assert t == MSG_CHAT_MESSAGE and expected in p, f"Expected {expected}, got {p}"
    print("  PASS: Multiple concatenated frames parsed without frame loss.")

    c1.close()
    c2.close()

    print("\nALL INTEGRATION TESTS PASSED SUCCESSFULLY!\n")

if __name__ == "__main__":
    host = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 9000
    test_suite(host, port)
