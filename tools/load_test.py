#!/usr/bin/env python3
"""
PulseChat Load Testing Tool
Spawns high numbers of concurrent TCP clients to test throughput, connection scalability,
message delivery rate, and latency percentiles against PulseChat Classic and PulseChat Reactor.
"""

import asyncio
import struct
import time
import argparse
import random
import statistics
import sys
from typing import List, Dict

# Protocol Message Types
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

HEADER_STRUCT = struct.Struct("!BI") # 1 byte type, 4 byte length (big endian)

def encode_frame(msg_type: int, payload: str) -> bytes:
    payload_bytes = payload.encode('utf-8')
    header = HEADER_STRUCT.pack(msg_type, len(payload_bytes))
    return header + payload_bytes

class PulseClientBot:
    def __init__(self, bot_id: int, host: str, port: int, room: str, stats: 'LoadTestStats'):
        self.bot_id = bot_id
        self.username = f"bot_{bot_id:04d}"
        self.host = host
        self.port = port
        self.room = room
        self.stats = stats
        self.reader: asyncio.StreamReader = None
        self.writer: asyncio.StreamWriter = None
        self.running = False
        self.in_buffer = bytearray()

    async def connect(self) -> bool:
        try:
            start_conn = time.time()
            self.reader, self.writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port),
                timeout=5.0
            )
            self.stats.record_connection_success(time.time() - start_conn)
            self.running = True
            
            # Register username
            self.writer.write(encode_frame(MSG_USER_REGISTER, self.username))
            await self.writer.drain()

            # Join target room if not general
            if self.room != "general":
                self.writer.write(encode_frame(MSG_JOIN_ROOM, self.room))
                await self.writer.drain()

            return True
        except Exception as e:
            self.stats.record_connection_failure()
            return False

    async def run_receiver(self):
        while self.running:
            try:
                data = await self.reader.read(4096)
                if not data:
                    break
                self.in_buffer.extend(data)

                # Process all complete frames
                while len(self.in_buffer) >= 5:
                    msg_type, length = HEADER_STRUCT.unpack_from(self.in_buffer, 0)
                    if len(self.in_buffer) < 5 + length:
                        break # Incomplete frame

                    payload = self.in_buffer[5:5+length].decode('utf-8', errors='ignore')
                    del self.in_buffer[:5+length]

                    self.stats.record_message_received()

                    # Check for latency measurement stamp
                    if msg_type == MSG_CHAT_MESSAGE and "§TS:" in payload:
                        try:
                            parts = payload.split("§TS:")
                            if len(parts) > 1:
                                sent_ts_str = parts[1].split("§")[0]
                                sent_ts = float(sent_ts_str)
                                latency_ms = (time.time() - sent_ts) * 1000.0
                                self.stats.record_latency(latency_ms)
                        except Exception:
                            pass

            except asyncio.CancelledError:
                break
            except Exception:
                break

    async def send_chat(self, text: str):
        if not self.running or not self.writer:
            return
        ts = time.time()
        payload = f"{text} §TS:{ts:.6f}§"
        frame = encode_frame(MSG_CHAT_MESSAGE, payload)
        self.writer.write(frame)
        await self.writer.drain()
        self.stats.record_message_sent()

    async def send_heartbeat(self):
        if not self.running or not self.writer:
            return
        frame = encode_frame(MSG_HEARTBEAT, "PING")
        self.writer.write(frame)
        await self.writer.drain()

    async def close(self):
        self.running = False
        if self.writer:
            try:
                self.writer.write(encode_frame(MSG_DISCONNECT, "Load test finished"))
                await self.writer.drain()
                self.writer.close()
                await self.writer.wait_closed()
            except Exception:
                pass


class LoadTestStats:
    def __init__(self):
        self.conn_success = 0
        self.conn_failure = 0
        self.msgs_sent = 0
        self.msgs_recv = 0
        self.conn_latencies: List[float] = []
        self.msg_latencies: List[float] = []
        self.start_time = 0.0
        self.end_time = 0.0

    def record_connection_success(self, duration: float):
        self.conn_success += 1
        self.conn_latencies.append(duration * 1000.0)

    def record_connection_failure(self):
        self.conn_failure += 1

    def record_message_sent(self):
        self.msgs_sent += 1

    def record_message_received(self):
        self.msgs_recv += 1

    def record_latency(self, latency_ms: float):
        self.msg_latencies.append(latency_ms)

    def print_summary(self, total_clients: int, target_msgs: int):
        total_duration = self.end_time - self.start_time
        conn_rate = self.conn_success / total_duration if total_duration > 0 else 0
        msg_rate = self.msgs_sent / total_duration if total_duration > 0 else 0
        recv_rate = self.msgs_recv / total_duration if total_duration > 0 else 0

        print("\n" + "=" * 60)
        print("           PULSECHAT LOAD TEST BENCHMARK RESULTS           ")
        print("=" * 60)
        print(f" Total Duration:          {total_duration:.2f} s")
        print(f" Target Clients:          {total_clients}")
        print(f" Successful Connections:  {self.conn_success} ({100.0*self.conn_success/max(1, total_clients):.1f}%)")
        print(f" Failed Connections:      {self.conn_failure}")
        print(f" Connection Rate:         {conn_rate:.1f} conns/sec")
        print("-" * 60)
        print(f" Total Messages Sent:     {self.msgs_sent}")
        print(f" Total Messages Recv:     {self.msgs_recv}")
        print(f" Message Send Rate:       {msg_rate:.1f} msgs/sec")
        print(f" Message Ingest/Bcast:    {recv_rate:.1f} msgs/sec")
        print("-" * 60)

        if self.msg_latencies:
            sorted_lat = sorted(self.msg_latencies)
            p50 = statistics.median(sorted_lat)
            p95 = sorted_lat[int(len(sorted_lat) * 0.95)]
            p99 = sorted_lat[int(len(sorted_lat) * 0.99)]
            min_l = min(sorted_lat)
            max_l = max(sorted_lat)
            mean_l = statistics.mean(sorted_lat)

            print(" Message End-to-End Latency:")
            print(f"   Min:     {min_l:8.2f} ms")
            print(f"   Mean:    {mean_l:8.2f} ms")
            print(f"   Median:  {p50:8.2f} ms")
            print(f"   P95:     {p95:8.2f} ms")
            print(f"   P99:     {p99:8.2f} ms")
            print(f"   Max:     {max_l:8.2f} ms")
        else:
            print(" No latency samples captured (messages may have had no subscribers).")

        print("=" * 60 + "\n")


async def main():
    parser = argparse.ArgumentParser(description="PulseChat Load Testing Benchmark Suite")
    parser.add_argument("--host", default="127.0.0.1", help="Server host IP (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=9000, help="Server port (default: 9000)")
    parser.add_argument("--clients", type=int, default=100, help="Number of concurrent clients (default: 100)")
    parser.add_argument("--messages", type=int, default=1000, help="Total messages to send (default: 1000)")
    parser.add_argument("--rooms", type=int, default=5, help="Number of chat rooms to distribute clients (default: 5)")
    parser.add_argument("--rate-delay", type=float, default=0.005, help="Inter-message dispatch delay (sec)")
    args = parser.parse_args()

    print(f"Starting PulseChat Load Test against {args.host}:{args.port}")
    print(f"Spawning {args.clients} clients across {args.rooms} rooms, generating {args.messages} messages...\n")

    stats = LoadTestStats()
    stats.start_time = time.time()

    rooms = ["general"] + [f"room_{i}" for i in range(1, args.rooms)]
    bots: List[PulseClientBot] = []

    # Phase 1: Connect all clients concurrently in batches
    print(f"--> Connecting {args.clients} clients...")
    batch_size = 50
    for i in range(0, args.clients, batch_size):
        batch_tasks = []
        for j in range(i, min(i + batch_size, args.clients)):
            room = rooms[j % len(rooms)]
            bot = PulseClientBot(j + 1, args.host, args.port, room, stats)
            bots.append(bot)
            batch_tasks.append(bot.connect())
        await asyncio.gather(*batch_tasks)

    connected_bots = [b for b in bots if b.running]
    print(f"--> {len(connected_bots)}/{args.clients} clients successfully connected & registered.")

    if not connected_bots:
        print("ERROR: No clients connected. Is the server running?")
        sys.exit(1)

    # Phase 2: Start background receiver tasks
    receiver_tasks = [asyncio.create_task(b.run_receiver()) for b in connected_bots]

    # Phase 3: Message blast
    print(f"--> Dispatching {args.messages} messages...")
    msg_start = time.time()
    for msg_idx in range(args.messages):
        sender = random.choice(connected_bots)
        await sender.send_chat(f"Benchmark msg #{msg_idx + 1} from {sender.username}")
        if args.rate_delay > 0:
            await asyncio.sleep(args.rate_delay)

    # Allow 1.5 seconds for in-flight messages and broadcasts to settle
    await asyncio.sleep(1.5)
    stats.end_time = time.time()

    # Phase 4: Cleanup & disconnect
    print("--> Closing connections...")
    for t in receiver_tasks:
        t.cancel()
    await asyncio.gather(*[b.close() for b in connected_bots])

    # Display results
    stats.print_summary(args.clients, args.messages)

if __name__ == "__main__":
    asyncio.run(main())
