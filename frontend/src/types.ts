export enum MessageType {
  CHAT_MESSAGE = 0x01,
  JOIN_ROOM = 0x02,
  LEAVE_ROOM = 0x03,
  PRIVATE_MESSAGE = 0x04,
  HEARTBEAT = 0x05,
  HEARTBEAT_ACK = 0x06,
  USER_REGISTER = 0x07,
  SERVER_NOTIFICATION = 0x08,
  LIST_ROOMS = 0x09,
  LIST_USERS = 0x0A,
  ERROR_RESPONSE = 0x0B,
  DISCONNECT = 0x0C,
  GET_METRICS = 0x0D,
  METRICS_UPDATE = 0x0E
}

export interface ChatMessage {
  id: string;
  type: MessageType;
  sender: string;
  targetUser?: string;
  displayName?: string;
  avatarUrl?: string;
  room?: string;
  text: string;
  timestamp: string;
  isSystem?: boolean;
  isPrivate?: boolean;
  isError?: boolean;
  isMentioned?: boolean;
  rawHex?: string;
}

export interface RoomItem {
  name: string;
  users: number;
  isProtected?: boolean;
}

export type UserStatus = 'online' | 'away' | 'dnd' | 'offline';

export interface UserItem {
  username: string;
  displayName?: string;
  avatarUrl?: string;
  email?: string;
  status: UserStatus;
  activityText?: string;
  room: string;
  lastSeen?: number;
}

export interface UserProfile {
  username: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  provider: 'google' | 'local';
  status: UserStatus;
  activityText?: string;
}

export interface SystemMetrics {
  uptime_sec: number;
  active_connections: number;
  total_connections: number;
  msgs_per_sec: number;
  bytes_per_sec: number;
  rooms?: RoomItem[];
}

export interface TelemetryEvent {
  direction: 'INBOUND' | 'OUTBOUND';
  type: MessageType;
  typeName: string;
  length: number;
  payload: string;
  rawHex: string;
  timestamp: string;
}
