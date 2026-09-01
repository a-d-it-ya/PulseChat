import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageType, ChatMessage, RoomItem, UserItem, SystemMetrics, TelemetryEvent, UserProfile, UserStatus } from '../types';
import { notificationAudio } from '../utils/audio';
import { ToastData } from '../components/Toast';

const STORAGE_KEY_PROFILE = 'pulsechat_user_profile';
const STORAGE_KEY_ROOM = 'pulsechat_current_room';
const STORAGE_KEY_MESSAGES = 'pulsechat_messages_history';
const STORAGE_KEY_WS_URL = 'pulsechat_ws_url_override';

export function getInitialWsUrl() {
  if (typeof window !== 'undefined') {
    // Clear any stale local storage overrides
    try {
      localStorage.removeItem(STORAGE_KEY_WS_URL);
    } catch {}

    if (window.location.protocol === 'https:') {
      return import.meta.env.VITE_WS_URL || 'wss://pulsechat-backend-yohc.onrender.com';
    }
    return import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:3001`;
  }
  return 'ws://127.0.0.1:3001';
}

export function usePulseChat() {
  const [wsUrl, setWsUrlState] = useState<string>(getInitialWsUrl);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [tcpStatus, setTcpStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');

  // Stored profile from localStorage (if any)
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PROFILE);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isRegistered, setIsRegistered] = useState<boolean>(() => !!profile);
  const [currentRoom, setCurrentRoom] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_ROOM) || 'general';
  });
  const [activeDmUser, setActiveDmUser] = useState<string | null>(null);

  // Messages list
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MESSAGES);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [rooms, setRooms] = useState<RoomItem[]>([{ name: 'general', users: 0, isProtected: false }]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [telemetryEvents, setTelemetryEvents] = useState<TelemetryEvent[]>([]);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [mentionCount, setMentionCount] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);

  const profileRef = useRef(profile);
  profileRef.current = profile;

  const currentRoomRef = useRef(currentRoom);
  currentRoomRef.current = currentRoom;

  const wsUrlRef = useRef(wsUrl);
  wsUrlRef.current = wsUrl;

  // Persist messages whenever updated (keep up to last 300 messages)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages.slice(-300)));
    } catch {}
  }, [messages]);

  // Persist profile
  useEffect(() => {
    if (profile) {
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(profile));
    } else {
      localStorage.removeItem(STORAGE_KEY_PROFILE);
    }
  }, [profile]);

  // Persist room
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ROOM, currentRoom);
  }, [currentRoom]);

  // Update document title on mention
  useEffect(() => {
    if (mentionCount > 0) {
      document.title = `(${mentionCount}) PulseChat — Notification!`;
    } else {
      document.title = `PulseChat — High-Concurrency Systems Messaging`;
    }
  }, [mentionCount]);

  // Reset mention count on focus
  useEffect(() => {
    const handleFocus = () => {
      setMentionCount(0);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Helper to add message
  const appendMessage = useCallback((msg: Omit<ChatMessage, 'id'>) => {
    const isMeMentioned = Boolean(
      profileRef.current?.username &&
      msg.text.toLowerCase().includes(`@${profileRef.current.username.toLowerCase()}`)
    );

    if ((isMeMentioned || msg.isPrivate) && !msg.isSystem && msg.sender !== profileRef.current?.username) {
      notificationAudio.playMentionChime();
      setMentionCount((prev) => prev + 1);
    }

    const newMsg: ChatMessage = {
      ...msg,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      isMentioned: isMeMentioned
    };
    setMessages((prev) => [...prev, newMsg]);
  }, []);

  // Send action to gateway
  const sendAction = useCallback((action: string, payload: Record<string, any> = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, ...payload }));
    }
  }, []);

  // Set and save custom WebSocket URL
  const updateWsUrl = useCallback((newUrl: string) => {
    const formatted = newUrl.trim().replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
    localStorage.setItem(STORAGE_KEY_WS_URL, formatted);
    setWsUrlState(formatted);
    wsUrlRef.current = formatted;
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
    }
  }, []);

  // Connect to Gateway WebSocket
  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setWsStatus('connecting');
    const targetUrl = wsUrlRef.current;
    
    let ws: WebSocket;
    try {
      ws = new WebSocket(targetUrl);
    } catch (e) {
      console.error('Invalid WebSocket URL:', targetUrl, e);
      setWsStatus('error');
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      // Auto-register if we have stored profile
      if (profileRef.current?.username) {
        ws.send(JSON.stringify({
          action: 'register',
          username: profileRef.current.username,
          displayName: profileRef.current.displayName,
          email: profileRef.current.email,
          avatarUrl: profileRef.current.avatarUrl,
          provider: profileRef.current.provider,
          status: profileRef.current.status,
          activityText: profileRef.current.activityText
        }));

        if (currentRoomRef.current && currentRoomRef.current !== 'general') {
          ws.send(JSON.stringify({
            action: 'join_room',
            room: currentRoomRef.current
          }));
        }
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // 1. TCP Status
        if (data.event === 'tcp_status') {
          setTcpStatus(data.status);
        }

        // 2. Rich Presence List
        if (data.event === 'presence_list' && Array.isArray(data.users)) {
          setUsers(data.users);
        }

        // 3. Real C++ Server Metrics & Enriched Rooms
        if (data.event === 'system_metrics' && data.data) {
          setMetrics(data.data);
          if (data.data.rooms && Array.isArray(data.data.rooms)) {
            setRooms(data.data.rooms);
          }
        }

        // 4. Historical Room Messages Replay
        if (data.event === 'room_history' && Array.isArray(data.messages)) {
          const myUser = profileRef.current?.username?.toLowerCase();
          const targetRoom = data.room || currentRoomRef.current;

          const loaded: ChatMessage[] = data.messages.map((m: any) => ({
            id: m.id,
            type: MessageType.CHAT_MESSAGE,
            sender: m.sender,
            displayName: m.displayName,
            avatarUrl: m.avatarUrl,
            room: m.room || targetRoom,
            text: m.text,
            timestamp: m.timestamp,
            isMentioned: Boolean(myUser && m.text?.toLowerCase().includes(`@${myUser}`))
          }));

          // Merge room history without duplicates
          setMessages((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const newHistory = loaded.filter((l) => !existingIds.has(l.id));
            return [...prev, ...newHistory];
          });
        }

        // 5. Live Telemetry Event
        if (data.event === 'telemetry_event' && data.eventData) {
          setTelemetryEvents((prev) => [data.eventData, ...prev.slice(0, 79)]);
        }

        // 6. PCAP Frame from C++ Server
        if (data.event === 'pcap_frame' && data.frame) {
          const frame = data.frame;
          const timeStr = frame.timestamp || new Date().toLocaleTimeString();

          switch (frame.type) {
            case MessageType.SERVER_NOTIFICATION: {
              const payload: string = frame.payload;

              // Filter out raw room/user list dumps
              if (payload.startsWith('=== Active Rooms') || payload.startsWith('=== Online Users')) {
                return;
              }

              // Welcome confirmation
              if (payload.includes('Welcome to PulseChat')) {
                setIsRegistered(true);
                setRegistrationError(null);
              }

              let notificationRoom: string | undefined = undefined;

              // Room join confirmation ("You joined room #systems")
              const joinMatch = payload.match(/You joined room #([\w-]+)/);
              if (joinMatch) {
                const r = joinMatch[1];
                setCurrentRoom(r);
                setActiveDmUser(null);
                notificationRoom = r;
              }

              // Peer joined room ("[SERVER] ubix joined #systems")
              const peerJoinMatch = payload.match(/\[SERVER\]\s+([\w-]+)\s+joined\s+#([\w-]+)/);
              if (peerJoinMatch) {
                notificationRoom = peerJoinMatch[2];
              }

              // Peer left room
              const peerLeftMatch = payload.match(/\[SERVER\]\s+([\w-]+)\s+left/);
              if (peerLeftMatch) {
                notificationRoom = currentRoomRef.current;
              }

              // Room leave confirmation
              if (payload.includes('returned to #general')) {
                setCurrentRoom('general');
                setActiveDmUser(null);
                notificationRoom = 'general';
              }

              appendMessage({
                type: frame.type,
                sender: 'SYSTEM',
                room: notificationRoom,
                text: payload,
                timestamp: timeStr,
                isSystem: true,
                rawHex: frame.rawHex
              });
              break;
            }

            case MessageType.CHAT_MESSAGE: {
              const payload = frame.payload;
              let sender = 'Unknown';
              let room = currentRoomRef.current;
              let text = payload;

              const match = payload.match(/^\[([\w-]+)\]\s*([\w-]+):\s*(.*)$/);
              if (match) {
                room = match[1];
                sender = match[2];
                text = match[3];
              }

              appendMessage({
                type: frame.type,
                sender,
                room,
                text,
                timestamp: timeStr,
                rawHex: frame.rawHex
              });
              break;
            }

            case MessageType.PRIVATE_MESSAGE: {
              const payload = frame.payload;
              let sender = 'Direct Message';
              let targetUser: string | undefined = undefined;

              const dmMatch = payload.match(/^\[DM from ([\w-]+)\]:\s*(.*)$/);
              const toMatch = payload.match(/^\[DM to ([\w-]+)\]:\s*(.*)$/);

              let text = payload;
              if (dmMatch) {
                sender = dmMatch[1];
                text = dmMatch[2];
              } else if (toMatch) {
                targetUser = toMatch[1];
                sender = profileRef.current?.username || 'You';
                text = toMatch[2];
              }

              appendMessage({
                type: frame.type,
                sender,
                targetUser,
                text,
                timestamp: timeStr,
                isPrivate: true,
                rawHex: frame.rawHex
              });
              break;
            }

            case MessageType.ERROR_RESPONSE: {
              if (!profileRef.current) {
                setRegistrationError(frame.payload);
              }
              if (
                frame.payload.includes('protected room') ||
                frame.payload.includes('Password') ||
                frame.payload.includes('Access denied')
              ) {
                setCurrentRoom('general');
              }
              // Show as Popup Toast Alert that auto-disappears!
              setToast({
                text: frame.payload,
                type: 'error',
                id: Date.now()
              });
              break;
            }

            default:
              break;
          }
        }
      } catch (err) {
        console.error('WebSocket parse error:', err);
      }
    };

    ws.onerror = () => {
      setWsStatus('error');
    };

    ws.onclose = () => {
      setWsStatus('disconnected');
      setTcpStatus('disconnected');
      if (!reconnectTimerRef.current) {
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, 2000);
      }
    };
  }, [appendMessage]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
      }
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  }, [connect, wsUrl]);

  // Periodic heartbeat & room refresher
  useEffect(() => {
    heartbeatTimerRef.current = window.setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && profileRef.current) {
        sendAction('heartbeat');
        sendAction('list_rooms');
      }
    }, 4000);

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  }, [sendAction]);

  // Register / login
  const login = useCallback((userProfile: UserProfile) => {
    setProfile(userProfile);
    setIsRegistered(true);
    setRegistrationError(null);
    sendAction('register', {
      username: userProfile.username,
      displayName: userProfile.displayName,
      email: userProfile.email,
      avatarUrl: userProfile.avatarUrl,
      provider: userProfile.provider,
      status: userProfile.status,
      activityText: userProfile.activityText
    });
  }, [sendAction]);

  // Update Status & Activity
  const updateStatus = useCallback((status: UserStatus, activityText?: string) => {
    if (!profile) return;
    const updated: UserProfile = {
      ...profile,
      status,
      activityText: activityText !== undefined ? activityText : profile.activityText
    };
    setProfile(updated);
    sendAction('update_status', {
      status,
      activityText: updated.activityText
    });
  }, [profile, sendAction]);

  // Logout
  const logout = useCallback(() => {
    setProfile(null);
    setIsRegistered(false);
    localStorage.removeItem(STORAGE_KEY_PROFILE);
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
    }
  }, []);

  const joinRoom = useCallback((roomName: string, password?: string) => {
    const trimmed = roomName.trim();
    if (!trimmed) return;
    sendAction('join_room', { room: trimmed, password });
    setActiveDmUser(null);
  }, [sendAction]);

  const leaveRoom = useCallback(() => {
    sendAction('leave_room');
    setActiveDmUser(null);
  }, [sendAction]);

  const sendPrivateMessage = useCallback((targetUser: string, text: string) => {
    const trimmed = text.trim();
    if (!targetUser || !trimmed) return;
    sendAction('private_message', { target: targetUser, text: trimmed });

    // Append outgoing message locally so it displays immediately in the DM chat feed
    appendMessage({
      type: MessageType.PRIVATE_MESSAGE,
      sender: profileRef.current?.username || 'You',
      targetUser: targetUser,
      text: trimmed,
      timestamp: new Date().toLocaleTimeString(),
      isPrivate: true
    });
  }, [sendAction, appendMessage]);

  const sendMessage = useCallback((rawInput: string) => {
    const input = rawInput.trim();
    if (!input) return;

    if (input.startsWith('/')) {
      if (input.startsWith('/join ')) {
        const parts = input.substring(6).trim().split(' ');
        const r = parts[0];
        const pwd = parts[1];
        if (r) joinRoom(r, pwd);
      } else if (input === '/leave') {
        leaveRoom();
      } else if (input === '/rooms') {
        sendAction('list_rooms');
      } else if (input === '/users') {
        sendAction('list_users');
      } else if (input.startsWith('/msg ')) {
        const parts = input.substring(5).split(' ');
        if (parts.length >= 2) {
          const target = parts[0];
          const text = parts.slice(1).join(' ');
          sendPrivateMessage(target, text);
        } else {
          setToast({
            text: 'Usage: /msg <username> <message>',
            type: 'info',
            id: Date.now()
          });
        }
      } else if (input === '/help') {
        appendMessage({
          type: MessageType.SERVER_NOTIFICATION,
          sender: 'HELP',
          text: 'Available Commands: /join <room> [password], /leave, /rooms, /users, /msg <user> <message>, /help',
          timestamp: new Date().toLocaleTimeString(),
          isSystem: true
        });
      } else {
        setToast({
          text: `Unknown command: ${input}. Type /help for command list.`,
          type: 'error',
          id: Date.now()
        });
      }
      return;
    }

    if (activeDmUser) {
      sendPrivateMessage(activeDmUser, input);
    } else {
      sendAction('chat', { text: input });
    }
  }, [activeDmUser, joinRoom, leaveRoom, sendPrivateMessage, sendAction, appendMessage]);

  return {
    wsUrl,
    updateWsUrl,
    wsStatus,
    tcpStatus,
    profile,
    username: profile?.username || '',
    isRegistered,
    currentRoom,
    activeDmUser,
    setActiveDmUser,
    messages,
    rooms,
    users,
    metrics,
    telemetryEvents,
    registrationError,
    toast,
    setToast,
    mentionCount,
    login,
    logout,
    updateStatus,
    joinRoom,
    leaveRoom,
    sendPrivateMessage,
    sendMessage
  };
}
