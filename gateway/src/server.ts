import net from 'net';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { encodeFrame, MessageType, PCAPParser, DecodedFrame } from './pcap';

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
          const parsed = JSON.parse(frame.payload);
          latestMetricsData = parsed;
          broadcastToAll({
            event: 'system_metrics',
            data: parsed,
            timestamp: frame.timestamp
          });
        } catch (e) {
          log('METRICS', `Failed to parse metrics JSON: ${frame.payload}`);
        }
      }
    }
  });

  client.on('error', (err) => {
    metricsConnected = false;
    log('METRICS', `Admin telemetry socket error: ${err.message}`);
  });

  client.on('close', () => {
    metricsConnected = false;
    log('METRICS', 'Admin telemetry socket closed. Reconnecting in 3s...');
    setTimeout(initMetricsPoller, 3000);
  });
}

// Periodic poller for metrics
setInterval(() => {
  if (metricsTcpSocket && metricsConnected && !metricsTcpSocket.destroyed) {
    metricsTcpSocket.write(encodeFrame(MessageType.GET_METRICS, ''));
  }
}, METRICS_POLL_INTERVAL);

// ============================================================================
// WebSocket Client Handling (1 WebSocket <-> 1 Dedicated C++ TCP Connection)
// ============================================================================
wss.on('connection', (ws: WebSocket, req) => {
  const clientIp = req.socket.remoteAddress || 'unknown';
  log('WS', `New WebSocket client connection from ${clientIp}`);

  const parser = new PCAPParser();
  const tcpSocket = new net.Socket();

  const session: ClientSession = {
    ws,
    tcp: tcpSocket,
    parser,
    username: '',
    displayName: '',
    status: 'online',
    activityText: '',
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

      // Broadcast raw PCAP telemetry to all clients for live stream panel
      broadcastToAll({
        event: 'telemetry_event',
        eventData: {
          direction: 'INBOUND',
          type: frame.type,
          typeName: frame.typeName,
          length: frame.length,
          payload: frame.payload.length > 80 ? frame.payload.substring(0, 80) + '...' : frame.payload,
          rawHex: frame.rawHex,
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
        status: 'error',
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
          session.username = msg.username;
          session.displayName = msg.displayName || msg.username;
          session.avatarUrl = msg.avatarUrl;
          session.status = msg.status || 'online';
          session.activityText = msg.activityText || '';

          userPresenceMap.set(msg.username, {
            username: msg.username,
            displayName: session.displayName,
            avatarUrl: session.avatarUrl,
            email: msg.email,
            status: session.status,
            activityText: session.activityText,
            room: 'general',
            lastSeen: Date.now()
          });
          broadcastPresence();

          frameBuffer = encodeFrame(MessageType.USER_REGISTER, msg.username);
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

        case 'chat':
          frameBuffer = encodeFrame(MessageType.CHAT_MESSAGE, msg.text);
          break;

        case 'join_room': {
          if (session.username) {
            const p = userPresenceMap.get(session.username);
            if (p) p.room = msg.room;
            broadcastPresence();
          }
          frameBuffer = encodeFrame(MessageType.JOIN_ROOM, msg.room);
          break;
        }

        case 'leave_room': {
          if (session.username) {
            const p = userPresenceMap.get(session.username);
            if (p) p.room = 'general';
            broadcastPresence();
          }
          frameBuffer = encodeFrame(MessageType.LEAVE_ROOM, msg.room || '');
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
server.listen(WS_PORT, () => {
  log('INIT', `PulseChat Gateway listening on WebSocket port ${WS_PORT}`);
  log('INIT', `Target C++ Reactor Server: ${TCP_HOST}:${TCP_PORT}`);
  initMetricsPoller();
});
