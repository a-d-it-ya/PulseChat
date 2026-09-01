import net from 'net';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { encodeFrame, MessageType, PCAPParser, DecodedFrame } from './pcap';
import { db } from './db';

dotenv.config();

const WS_PORT = parseInt(process.env.PORT || '3001', 10);
const TCP_HOST = process.env.TCP_HOST || '127.0.0.1';
const TCP_PORT = parseInt(process.env.TCP_PORT || '9000', 10);
const METRICS_POLL_INTERVAL = parseInt(process.env.METRICS_POLL_INTERVAL_MS || '1500', 10);

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'pulsechat-gateway' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

interface UserPresence {
  username: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
  status: 'online' | 'away' | 'dnd' | 'offline';
  activityText?: string;
  room: string;
  lastSeen: number;
}

interface ClientSession {
  ws: WebSocket;
  tcp: net.Socket;
  parser: PCAPParser;
  username: string;
  displayName: string;
  avatarUrl?: string;
  status: 'online' | 'away' | 'dnd' | 'offline';
  activityText?: string;
  currentRoom: string;
  isRegistered: boolean;
}

const activeSessions = new Map<WebSocket, ClientSession>();
const userPresenceMap = new Map<string, UserPresence>();

function log(tag: string, message: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${tag}] ${message}`);
}

function broadcastToAll(payload: object) {
  const data = JSON.stringify(payload);
  for (const [ws] of activeSessions) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function broadcastPresence() {
  const list = Array.from(userPresenceMap.values());
  broadcastToAll({
    event: 'presence_list',
    users: list
  });
}

function getEnrichedRooms(liveRooms: { name: string; users: number }[] = []) {
  const dbRooms = db.getAllRooms();
  const map = new Map<string, { name: string; users: number; isProtected: boolean }>();

  // Add DB rooms
  for (const r of dbRooms) {
    map.set(r.name.toLowerCase(), {
      name: r.name,
      users: 0,
      isProtected: Boolean(r.isProtected)
    });
  }

  // Merge live user counts
  for (const lr of liveRooms) {
    const key = lr.name.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.users = lr.users;
    } else {
      map.set(key, {
        name: lr.name,
        users: lr.users,
        isProtected: false
      });
    }
  }

  return Array.from(map.values());
}

// ============================================================================
// Metrics & Live Observability Poller (Admin TCP Connection to C++ Server)
// ============================================================================
let metricsTcpSocket: net.Socket | null = null;
const metricsParser = new PCAPParser();
let latestMetricsData: any = null;
let metricsConnected = false;

function initMetricsPoller() {
  if (metricsTcpSocket) {
    try {
      metricsTcpSocket.destroy();
    } catch {}
    metricsTcpSocket = null;
  }

  log('METRICS', `Connecting admin telemetry socket to C++ server at ${TCP_HOST}:${TCP_PORT}...`);
  const client = new net.Socket();
  metricsTcpSocket = client;

  client.connect(TCP_PORT, TCP_HOST, () => {
    log('METRICS', 'Connected admin telemetry socket to C++ server.');
    metricsConnected = true;
    client.write(encodeFrame(MessageType.GET_METRICS, ''));
  });

  client.on('data', (chunk: Buffer) => {
    const frames = metricsParser.push(chunk);
    for (const frame of frames) {
      if (frame.type === MessageType.METRICS_UPDATE) {
        try {
          const raw = JSON.parse(frame.payload);
          latestMetricsData = {
            uptime_sec: raw.uptime_sec || 0,
            active_connections: raw.active_connections || 0,
            total_connections: raw.total_connections || 0,
            msgs_per_sec: raw.msgs_per_sec || 0,
            bytes_per_sec: raw.bytes_per_sec || 0,
            rooms: getEnrichedRooms(raw.rooms || [])
          };

          broadcastToAll({
            event: 'system_metrics',
            data: latestMetricsData,
            timestamp: new Date().toLocaleTimeString()
          });
        } catch (err: any) {
          log('METRICS_ERR', `Failed to parse metrics JSON: ${err.message}`);
        }
      }
    }
  });

  client.on('error', (err) => {
    log('METRICS_ERR', `Admin metrics TCP error: ${err.message}`);
    metricsConnected = false;
  });

  client.on('close', () => {
    log('METRICS', 'Admin metrics TCP socket closed. Reconnecting in 3s...');
    metricsConnected = false;
    setTimeout(initMetricsPoller, 3000);
  });
}

// Periodically request metrics from C++ Server
setInterval(() => {
  if (metricsTcpSocket && metricsConnected && !metricsTcpSocket.destroyed) {
    metricsTcpSocket.write(encodeFrame(MessageType.GET_METRICS, ''));
  }
}, METRICS_POLL_INTERVAL);

// ============================================================================
// Main WebSocket Client Handler
// ============================================================================
wss.on('connection', (ws: WebSocket, req) => {
  const clientIp = req.socket.remoteAddress || 'unknown';
  log('WS', `Client connected from ${clientIp}`);

  const tcpSocket = new net.Socket();
  const parser = new PCAPParser();

  const session: ClientSession = {
    ws,
    tcp: tcpSocket,
    parser,
    username: '',
    displayName: '',
    status: 'online',
    activityText: '',
    currentRoom: 'general',
    isRegistered: false
  };

  activeSessions.set(ws, session);

  // Send initial presence & metrics
  ws.send(JSON.stringify({
    event: 'presence_list',
    users: Array.from(userPresenceMap.values())
  }));

  if (latestMetricsData) {
    ws.send(JSON.stringify({
      event: 'system_metrics',
      data: latestMetricsData,
      timestamp: new Date().toLocaleTimeString()
    }));
  }

  // Connect TCP socket to C++ server
  const connectTcp = () => {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      tcpSocket.connect(TCP_PORT, TCP_HOST, () => {
        log('TCP', `Bridged WebSocket client (${clientIp}) to C++ TCP server`);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            event: 'tcp_status',
            status: 'connected',
            server: `${TCP_HOST}:${TCP_PORT}`
          }));
        }
      });
    } catch (e: any) {
      log('TCP_ERR', `Failed to connect to C++ server: ${e.message}`);
    }
  };

  connectTcp();

  // Handle incoming data from C++ TCP Server
  tcpSocket.on('data', (chunk: Buffer) => {
    const frames = parser.push(chunk);
    for (const frame of frames) {
      log('PCAP_IN', `[fd->WS] Type: ${frame.typeName} (${frame.type}), Len: ${frame.length}B`);

      // Forward decoded frame to browser
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          event: 'pcap_frame',
          frame
        }));
      }

      // Broadcast raw PCAP telemetry to all clients (Sanitize private DMs!)
      const isPrivate = frame.type === MessageType.PRIVATE_MESSAGE;
      const telemetryPayload = isPrivate
        ? '[🔒 Encrypted Direct Message]'
        : frame.payload.length > 80
        ? frame.payload.substring(0, 80) + '...'
        : frame.payload;

      broadcastToAll({
        event: 'telemetry_event',
        eventData: {
          direction: 'INBOUND',
          type: frame.type,
          typeName: frame.typeName,
          length: frame.length,
          payload: telemetryPayload,
          rawHex: isPrivate ? '2a 2a 2a 2a 2a' : frame.rawHex,
          timestamp: frame.timestamp
        }
      });
    }
  });

  tcpSocket.on('error', (err) => {
    log('TCP_ERR', `TCP Error for client: ${err.message}`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        event: 'tcp_status',
        status: 'disconnected',
        details: err.message
      }));
    }
  });

  tcpSocket.on('close', () => {
    log('TCP', 'C++ TCP socket closed');
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        event: 'tcp_status',
        status: 'disconnected'
      }));
    }
  });

  // Handle incoming messages from Browser WebSocket
  ws.on('message', (data: string) => {
    try {
      const msg = JSON.parse(data.toString());
      log('WS_IN', `Received action: ${msg.action} from ${session.username || 'unregistered'}`);

      let frameBuffer: Buffer | null = null;

      switch (msg.action) {
        case 'register': {
          const userValidation = db.validateAndRegisterUser(
            msg.username,
            msg.email,
            msg.displayName,
            msg.avatarUrl,
            msg.provider || 'google'
          );

          if (!userValidation.success) {
            ws.send(JSON.stringify({
              event: 'pcap_frame',
              frame: {
                type: MessageType.ERROR_RESPONSE,
                typeName: 'ERROR_RESPONSE',
                length: userValidation.error?.length || 0,
                payload: userValidation.error || 'Username registration failed.',
                timestamp: new Date().toLocaleTimeString()
              }
            }));
            return;
          }

          const u = userValidation.user!;
          session.username = u.username;
          session.displayName = u.displayName;
          session.avatarUrl = u.avatarUrl;
          session.status = msg.status || 'online';
          session.activityText = msg.activityText || '';
          session.isRegistered = true;

          userPresenceMap.set(u.username, {
            username: u.username,
            displayName: session.displayName,
            avatarUrl: session.avatarUrl,
            email: u.email,
            status: session.status,
            activityText: session.activityText,
            room: session.currentRoom || 'general',
            lastSeen: Date.now()
          });
          broadcastPresence();

          frameBuffer = encodeFrame(MessageType.USER_REGISTER, u.username);

          // Send initial #general history upon registration
          const history = db.getRoomHistory(session.currentRoom || 'general', 50);
          ws.send(JSON.stringify({
            event: 'room_history',
            room: session.currentRoom || 'general',
            messages: history
          }));
          break;
        }

        case 'update_status': {
          if (session.username) {
            session.status = msg.status || session.status;
            session.activityText = msg.activityText !== undefined ? msg.activityText : session.activityText;
            const existing = userPresenceMap.get(session.username);
            if (existing) {
              existing.status = session.status;
              existing.activityText = session.activityText;
              existing.lastSeen = Date.now();
            }
            broadcastPresence();
          }
          break;
        }

        case 'chat': {
          if (session.username && msg.text) {
            db.addMessage(
              session.currentRoom || 'general',
              session.username,
              msg.text,
              session.displayName,
              session.avatarUrl
            );
          }
          frameBuffer = encodeFrame(MessageType.CHAT_MESSAGE, msg.text);
          break;
        }

        case 'join_room': {
          const roomName = (msg.room || 'general').trim();
          const password = msg.password;

          // Check DB for password protection
          const roomCheck = db.createOrJoinRoom(roomName, password, session.username);
          if (!roomCheck.success) {
            ws.send(JSON.stringify({
              event: 'pcap_frame',
              frame: {
                type: MessageType.ERROR_RESPONSE,
                typeName: 'ERROR_RESPONSE',
                length: roomCheck.error?.length || 0,
                payload: roomCheck.error || 'Cannot enter protected room.',
                timestamp: new Date().toLocaleTimeString()
              }
            }));
            return;
          }

          session.currentRoom = roomName;
          if (session.username) {
            const p = userPresenceMap.get(session.username);
            if (p) p.room = roomName;
            broadcastPresence();
          }

          frameBuffer = encodeFrame(MessageType.JOIN_ROOM, roomName);

          // Send historical messages for this room
          const history = db.getRoomHistory(roomName, 50);
          ws.send(JSON.stringify({
            event: 'room_history',
            room: roomName,
            messages: history
          }));
          break;
        }

        case 'leave_room': {
          session.currentRoom = 'general';
          if (session.username) {
            const p = userPresenceMap.get(session.username);
            if (p) p.room = 'general';
            broadcastPresence();
          }
          frameBuffer = encodeFrame(MessageType.LEAVE_ROOM, msg.room || '');

          const history = db.getRoomHistory('general', 50);
          ws.send(JSON.stringify({
            event: 'room_history',
            room: 'general',
            messages: history
          }));
          break;
        }

        case 'private_message':
          frameBuffer = encodeFrame(MessageType.PRIVATE_MESSAGE, `${msg.target}:${msg.text}`);
          break;

        case 'list_rooms':
          frameBuffer = encodeFrame(MessageType.LIST_ROOMS, '');
          break;

        case 'list_users':
          frameBuffer = encodeFrame(MessageType.LIST_USERS, '');
          break;

        case 'heartbeat':
          frameBuffer = encodeFrame(MessageType.HEARTBEAT, 'PING');
          break;

        case 'get_metrics':
          frameBuffer = encodeFrame(MessageType.GET_METRICS, '');
          break;

        default:
          log('WS_WARN', `Unknown action received: ${msg.action}`);
          break;
      }

      if (frameBuffer && !tcpSocket.destroyed) {
        tcpSocket.write(frameBuffer);

        const now = new Date();
        const timeStr = `${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}`;

        broadcastToAll({
          event: 'telemetry_event',
          eventData: {
            direction: 'OUTBOUND',
            type: frameBuffer.readUInt8(0),
            typeName: MessageType[frameBuffer.readUInt8(0)] || 'UNKNOWN',
            length: frameBuffer.readUInt32BE(1),
            payload: msg.text || msg.room || msg.username || msg.target || '',
            rawHex: frameBuffer.subarray(0, Math.min(32, frameBuffer.length)).toString('hex').toUpperCase(),
            timestamp: timeStr
          }
        });
      }
    } catch (e: any) {
      log('WS_ERR', `Failed to parse WebSocket message: ${e.message}`);
    }
  });

  ws.on('close', () => {
    log('WS', `Client disconnected: ${session.username || clientIp}`);
    if (session.username) {
      userPresenceMap.delete(session.username);
      broadcastPresence();
    }
    if (!tcpSocket.destroyed) {
      try {
        tcpSocket.write(encodeFrame(MessageType.DISCONNECT, 'Browser disconnected'));
        tcpSocket.end();
      } catch {}
    }
    activeSessions.delete(ws);
  });
});

// Start Gateway Server
server.listen(WS_PORT, '0.0.0.0', () => {
  log('INIT', `PulseChat Gateway listening on WebSocket port ${WS_PORT} (0.0.0.0)`);
  log('INIT', `Target C++ Reactor Server: ${TCP_HOST}:${TCP_PORT}`);
  initMetricsPoller();
});
