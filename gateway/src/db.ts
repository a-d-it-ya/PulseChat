import fs from 'fs';
import path from 'path';

export interface DbUser {
  username: string; // unique handle
  email?: string;
  displayName: string;
  avatarUrl: string;
  provider: 'google' | 'local';
  createdAt: number;
  lastActive: number;
}

export interface DbRoom {
  name: string;
  isProtected: boolean;
  password?: string; // plain or hash
  createdBy?: string;
  createdAt: number;
}

export interface DbMessage {
  id: string;
  room: string;
  sender: string;
  displayName?: string;
  avatarUrl?: string;
  text: string;
  timestamp: string;
  createdAt: number;
}

interface DatabaseSchema {
  users: Record<string, DbUser>; // keyed by username lowercase
  rooms: Record<string, DbRoom>; // keyed by room name lowercase
  messages: DbMessage[];
}

export class PulseDatabase {
  private dbPath: string;
  private data: DatabaseSchema;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(__dirname, '..', 'data', 'pulsechat_db.json');
    this.data = {
      users: {},
      rooms: {
        general: {
          name: 'general',
          isProtected: false,
          createdAt: Date.now()
        },
        engineering: {
          name: 'engineering',
          isProtected: false,
          createdAt: Date.now()
        },
        gaming: {
          name: 'gaming',
          isProtected: false,
          createdAt: Date.now()
        }
      },
      messages: []
    };
    this.init();
  }

  private init() {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        this.data = JSON.parse(raw);
        // Ensure default rooms exist
        if (!this.data.rooms.general) {
          this.data.rooms.general = { name: 'general', isProtected: false, createdAt: Date.now() };
        }
      } else {
        this.save();
      }
    } catch (err) {
      console.error('Failed to initialize database:', err);
    }
  }

  private save() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist database:', err);
    }
  }

  // --- USER OPERATIONS ---
  public findUserByEmail(email: string): DbUser | undefined {
    const target = email.trim().toLowerCase();
    for (const user of Object.values(this.data.users)) {
      if (user.email && user.email.trim().toLowerCase() === target) {
        return user;
      }
    }
    return undefined;
  }

  public validateAndRegisterUser(
    username: string,
    email: string | undefined,
    displayName: string,
    avatarUrl: string,
    provider: 'google' | 'local'
  ): { success: boolean; error?: string; user?: DbUser } {
    // If email is provided, check if user already exists with this email
    if (email) {
      const existingByEmail = this.findUserByEmail(email);
      if (existingByEmail) {
        existingByEmail.displayName = displayName || existingByEmail.displayName;
        existingByEmail.avatarUrl = avatarUrl || existingByEmail.avatarUrl;
        existingByEmail.lastActive = Date.now();
        this.save();
        return { success: true, user: existingByEmail };
      }
    }

    const handle = username.trim().toLowerCase();
    if (!handle) {
      return { success: false, error: 'Username cannot be empty.' };
    }

    const existing = this.data.users[handle];
    if (existing) {
      // If claimed by another email in Google provider
      if (email && existing.email && existing.email.toLowerCase() !== email.toLowerCase()) {
        return {
          success: false,
          error: `Username '@${handle}' is already registered by another account. Please choose a different unique handle.`
        };
      }
      // Update existing user profile
      existing.displayName = displayName || existing.displayName;
      existing.avatarUrl = avatarUrl || existing.avatarUrl;
      if (email && !existing.email) existing.email = email;
      existing.lastActive = Date.now();
      this.save();
      return { success: true, user: existing };
    }

    // Register new unique user
    const newUser: DbUser = {
      username: handle,
      email,
      displayName: displayName || handle,
      avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${handle}`,
      provider,
      createdAt: Date.now(),
      lastActive: Date.now()
    };

    this.data.users[handle] = newUser;
    this.save();
    return { success: true, user: newUser };
  }

  public getUser(username: string): DbUser | undefined {
    return this.data.users[username.toLowerCase()];
  }

  // --- ROOM OPERATIONS ---
  public createOrJoinRoom(
    roomName: string,
    password?: string,
    createdBy?: string
  ): { success: boolean; error?: string; room?: DbRoom } {
    const name = roomName.trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!name) {
      return { success: false, error: 'Room name cannot be empty.' };
    }

    const existing = this.data.rooms[name];
    if (existing) {
      // Check password if protected
      if (existing.isProtected && existing.password) {
        if (!password || !password.trim()) {
          return {
            success: false,
            error: `Password required to join protected room #${existing.name}.`
          };
        }
        if (password.trim() !== existing.password.trim()) {
          return {
            success: false,
            error: `Incorrect password for protected room #${existing.name}. Access denied.`
          };
        }
      }
      return { success: true, room: existing };
    }

    // Create new room
    const isProtected = Boolean(password && password.trim().length > 0);
    const newRoom: DbRoom = {
      name,
      isProtected,
      password: isProtected ? password!.trim() : undefined,
      createdBy,
      createdAt: Date.now()
    };

    this.data.rooms[name] = newRoom;
    this.save();
    return { success: true, room: newRoom };
  }

  public getAllRooms(): DbRoom[] {
    return Object.values(this.data.rooms);
  }

  public getRoom(roomName: string): DbRoom | undefined {
    return this.data.rooms[roomName.toLowerCase()];
  }

  // --- MESSAGE HISTORY OPERATIONS ---
  public saveMessage(
    room: string,
    sender: string,
    text: string,
    displayName?: string,
    avatarUrl?: string
  ): DbMessage {
    const newMsg: DbMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      room: room.toLowerCase(),
      sender,
      displayName,
      avatarUrl,
      text,
      timestamp: new Date().toLocaleTimeString(),
      createdAt: Date.now()
    };

    this.data.messages.push(newMsg);

    // Keep up to 5,000 recent messages in DB
    if (this.data.messages.length > 5000) {
      this.data.messages = this.data.messages.slice(-5000);
    }

    this.save();
    return newMsg;
  }

  public addMessage(
    room: string,
    sender: string,
    text: string,
    displayName?: string,
    avatarUrl?: string
  ): DbMessage {
    return this.saveMessage(room, sender, text, displayName, avatarUrl);
  }

  public getRoomHistory(roomName: string, limit = 50): DbMessage[] {
    const target = roomName.toLowerCase();
    const matches = this.data.messages.filter((m) => m.room.toLowerCase() === target);
    return matches.slice(-limit);
  }
}

export const db = new PulseDatabase();
