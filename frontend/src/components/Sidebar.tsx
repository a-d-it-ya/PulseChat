import React, { useState } from 'react';
import { Hash, Users, Plus, MessageSquare, Radio, Shield, Smile, Edit3, Check, LogOut, Settings, Lock, KeyRound, MessageCircle } from 'lucide-react';
import { RoomItem, UserItem, UserProfile, UserStatus, ChatMessage } from '../types';

interface SidebarProps {
  currentRoom: string;
  rooms: RoomItem[];
  users: UserItem[];
  messages: ChatMessage[];
  profile: UserProfile | null;
  activeDmUser: string | null;
  onSelectRoom: (roomName: string, password?: string) => void;
  onSelectDmUser: (username: string | null) => void;
  onJoinRoom: (roomName: string, password?: string) => void;
  onUpdateStatus: (status: UserStatus, activityText?: string) => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRoom,
  rooms,
  users,
  messages,
  profile,
  activeDmUser,
  onSelectRoom,
  onSelectDmUser,
  onJoinRoom,
  onUpdateStatus,
  onLogout
}) => {
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [isProtectedRoom, setIsProtectedRoom] = useState(false);
  const [newRoomPassword, setNewRoomPassword] = useState('');

  // Password prompt for joining locked rooms
  const [promptTargetRoom, setPromptTargetRoom] = useState<string | null>(null);
  const [joinPassword, setJoinPassword] = useState('');

  // Status & Presence modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [customActivity, setCustomActivity] = useState(profile?.activityText || '');
  const [selectedStatus, setSelectedStatus] = useState<UserStatus>(profile?.status || 'online');

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newRoomName.trim();
    if (trimmed) {
      onJoinRoom(trimmed, isProtectedRoom ? newRoomPassword.trim() : undefined);
      setNewRoomName('');
      setNewRoomPassword('');
      setIsProtectedRoom(false);
      setShowCreateModal(false);
    }
  };

  const handleRoomClick = (room: RoomItem) => {
    if (room.isProtected && room.name.toLowerCase() !== currentRoom.toLowerCase()) {
      setPromptTargetRoom(room.name);
      setJoinPassword('');
    } else {
      onSelectRoom(room.name);
      onSelectDmUser(null);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (promptTargetRoom) {
      onSelectRoom(promptTargetRoom, joinPassword);
      setPromptTargetRoom(null);
      setJoinPassword('');
    }
  };

  const handleSaveStatus = () => {
    onUpdateStatus(selectedStatus, customActivity);
    setShowStatusModal(false);
  };

  const getStatusColor = (status?: UserStatus) => {
    switch (status) {
      case 'online': return 'bg-pulse-green';
      case 'away': return 'bg-pulse-yellow';
      case 'dnd': return 'bg-pulse-red';
      case 'offline': return 'bg-pulse-muted';
      default: return 'bg-pulse-green';
    }
  };

  // Find users with active DM history
  const dmUsersSet = new Set<string>();
  for (const m of messages) {
    if (m.isPrivate) {
      if (m.sender && m.sender !== 'SYSTEM' && m.sender !== 'You' && m.sender !== profile?.username) {
        dmUsersSet.add(m.sender.toLowerCase());
      }
      if (m.targetUser && m.targetUser !== profile?.username) {
        dmUsersSet.add(m.targetUser.toLowerCase());
      }
    }
  }

  // Also include currently active DM user
  if (activeDmUser) {
    dmUsersSet.add(activeDmUser.toLowerCase());
  }

  const dmUserList = Array.from(dmUsersSet);
  const displayRooms = rooms.length > 0 ? rooms : [{ name: 'general', users: 1, isProtected: false }];

  return (
    <aside className="w-64 border-r border-pulse-border bg-pulse-card/50 flex flex-col shrink-0 select-none">
      {/* 1. ROOMS SECTION */}
      <div className="p-3 border-b border-pulse-border">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-pulse-muted flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-pulse-accent" />
            Chat Rooms ({displayRooms.length})
          </span>
          <button
            onClick={() => setShowCreateModal(true)}
            className="p-1 rounded hover:bg-pulse-surface text-pulse-muted hover:text-pulse-accent transition-colors"
            title="Create New Room (Public or Password Protected)"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-0.5 overflow-y-auto max-h-36 pr-1">
          {displayRooms.map((room) => {
            const isActive = !activeDmUser && currentRoom.toLowerCase() === room.name.toLowerCase();
            return (
              <button
                key={room.name}
                onClick={() => handleRoomClick(room)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  isActive
                    ? 'bg-pulse-accent/10 text-pulse-accent border border-pulse-accent/30 font-semibold shadow-[0_0_10px_rgba(0,240,255,0.1)]'
                    : 'text-pulse-muted hover:bg-pulse-surface hover:text-white border border-transparent'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className={isActive ? 'text-pulse-accent' : 'text-pulse-muted/60'}>#</span>
                  <span className="truncate">{room.name}</span>
                  {room.isProtected && (
                    <Lock className="w-3 h-3 text-pulse-yellow shrink-0" title="Password Protected Room" />
                  )}
                </div>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-pulse-surface border border-pulse-border text-pulse-muted">
                  {room.users}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. DIRECT MESSAGES (DMs) SECTION */}
      <div className="p-3 border-b border-pulse-border">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-pulse-muted flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5 text-pulse-magenta" />
            Direct Messages ({dmUserList.length})
          </span>
        </div>

        <div className="space-y-0.5 overflow-y-auto max-h-36 pr-1">
          {dmUserList.length === 0 ? (
            <p className="text-[11px] font-mono text-pulse-muted/50 px-2 py-1 italic">
              Click any active peer below to start a private DM.
            </p>
          ) : (
            dmUserList.map((targetHandle) => {
              const isSelected = activeDmUser?.toLowerCase() === targetHandle.toLowerCase();
              const peerInfo = users.find((u) => u.username.toLowerCase() === targetHandle.toLowerCase());

              return (
                <button
                  key={targetHandle}
                  onClick={() => onSelectDmUser(targetHandle)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all ${
                    isSelected
                      ? 'bg-pulse-magenta/15 text-pulse-magenta border border-pulse-magenta/40 font-bold shadow-[0_0_12px_rgba(255,0,127,0.2)]'
                      : 'text-pulse-muted hover:bg-pulse-surface hover:text-white border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(peerInfo?.status || 'offline')}`}
                    />
                    <span className="truncate font-bold">@{targetHandle}</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-pulse-surface border border-pulse-border text-pulse-magenta font-mono">
                    DM
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 3. ACTIVE PEERS SECTION (Shown by Unique Username) */}
      <div className="flex-1 p-3 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-pulse-muted flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-pulse-green" />
            Active Peers ({users.length})
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {users.length === 0 ? (
            <div className="text-xs font-mono text-pulse-muted/50 p-2 italic">
              Scanning active sockets...
            </div>
          ) : (
            users.map((u) => {
              const isMe = u.username.toLowerCase() === profile?.username.toLowerCase();
              const isDmActive = activeDmUser?.toLowerCase() === u.username.toLowerCase();

              return (
                <button
                  key={u.username}
                  disabled={isMe}
                  onClick={() => onSelectDmUser(isDmActive ? null : u.username)}
                  className={`w-full flex flex-col px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all text-left group ${
                    isDmActive
                      ? 'bg-pulse-magenta/10 text-pulse-magenta border border-pulse-magenta/30 font-semibold shadow-[0_0_10px_rgba(255,0,127,0.15)]'
                      : isMe
                      ? 'bg-pulse-surface/30 border border-pulse-border/50 text-white cursor-default'
                      : 'text-pulse-muted hover:bg-pulse-surface hover:text-white border border-transparent cursor-pointer'
                  }`}
                  title={isMe ? 'You' : `Click to DM @${u.username}`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2 truncate">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(u.status)}`} />
                      {/* PROMINENT UNIQUE USERNAME */}
                      <span className="truncate font-bold text-white group-hover:text-pulse-accent">
                        @{u.username}
                      </span>
                      {isMe && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-pulse-accent/20 border border-pulse-accent/40 text-pulse-accent font-bold">
                          YOU
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-pulse-muted/60 truncate max-w-[50px]">
                      #{u.room}
                    </span>
                  </div>

                  {/* Activity text */}
                  {u.activityText && (
                    <p className="text-[10px] text-pulse-accent/80 font-sans truncate pl-4 mt-0.5">
                      {u.activityText}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 4. USER PROFILE & STATUS FOOTER */}
      <div className="p-3 border-t border-pulse-border bg-pulse-surface/40 flex items-center justify-between">
        <div
          onClick={() => setShowStatusModal(true)}
          className="flex items-center gap-2 min-w-0 cursor-pointer group flex-1"
          title="Click to change status & activity"
        >
          <div className="relative shrink-0">
            {profile?.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt="avatar"
                className="w-7 h-7 rounded-full bg-pulse-card border border-pulse-border"
              />
            ) : (
              <div className="w-7 h-7 rounded bg-pulse-accent/10 border border-pulse-accent/30 text-pulse-accent flex items-center justify-center text-xs font-mono font-bold">
                {profile?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-pulse-bg ${getStatusColor(
                profile?.status
              )}`}
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-mono font-bold text-white truncate group-hover:text-pulse-accent transition-colors">
              @{profile?.username}
            </p>
            <p className="text-[10px] font-mono text-pulse-muted truncate">
              {profile?.activityText || 'Set custom status...'}
            </p>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="p-1.5 text-pulse-muted hover:text-pulse-red rounded hover:bg-pulse-surface transition-colors"
          title="Sign Out / Switch User"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 5. CREATE ROOM MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-pulse-card border border-pulse-border rounded-xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-pulse-border pb-2">
              <span className="font-bold text-white text-xs font-mono uppercase tracking-wider flex items-center gap-1.5">
                <Hash className="w-4 h-4 text-pulse-accent" />
                Create New Chat Room
              </span>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-pulse-muted hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-3">
              <div>
                <label className="block text-[10px] font-mono text-pulse-muted uppercase mb-1">
                  Room Name <span className="text-pulse-accent">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-pulse-muted font-mono text-xs">#</span>
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="crypto-lab"
                    autoFocus
                    required
                    maxLength={32}
                    className="w-full bg-pulse-surface border border-pulse-border focus:border-pulse-accent rounded-lg pl-7 pr-3 py-1.5 text-xs font-mono text-white placeholder-pulse-muted/50 focus:outline-none"
                  />
                </div>
              </div>

              {/* Password Protection Toggle */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isProtectedRoom}
                    onChange={(e) => setIsProtectedRoom(e.target.checked)}
                    className="rounded border-pulse-border bg-pulse-surface text-pulse-accent focus:ring-0"
                  />
                  <span className="text-xs font-mono text-white flex items-center gap-1">
                    <Lock className="w-3 h-3 text-pulse-yellow" />
                    Protect room with password
                  </span>
                </label>
              </div>

              {isProtectedRoom && (
                <div className="space-y-1 animate-in fade-in">
                  <label className="block text-[10px] font-mono text-pulse-yellow uppercase">
                    Room Passcode / Password <span className="text-pulse-red">*</span>
                  </label>
                  <input
                    type="password"
                    value={newRoomPassword}
                    onChange={(e) => setNewRoomPassword(e.target.value)}
                    placeholder="Enter secret passcode"
                    required={isProtectedRoom}
                    className="w-full bg-pulse-surface border border-pulse-yellow/50 focus:border-pulse-yellow rounded-lg px-3 py-1.5 text-xs font-mono text-white placeholder-pulse-muted/50 focus:outline-none"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2 rounded-lg bg-pulse-surface hover:bg-pulse-hover border border-pulse-border text-xs font-mono text-pulse-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newRoomName.trim() || (isProtectedRoom && !newRoomPassword.trim())}
                  className="flex-1 py-2 rounded-lg bg-pulse-accent hover:bg-pulse-accent/90 disabled:opacity-40 text-xs font-mono font-bold text-black flex items-center justify-center gap-1 shadow-[0_0_12px_rgba(0,240,255,0.2)]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Room</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. PASSWORD PROMPT MODAL */}
      {promptTargetRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-pulse-card border border-pulse-yellow/50 rounded-xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-pulse-border pb-2">
              <span className="font-bold text-white text-xs font-mono uppercase tracking-wider flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-pulse-yellow" />
                Protected Room: #{promptTargetRoom}
              </span>
              <button
                onClick={() => setPromptTargetRoom(null)}
                className="text-pulse-muted hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-pulse-muted font-mono">
              This channel requires a secret password to join and view chat history.
            </p>

            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <div>
                <label className="block text-[10px] font-mono text-pulse-muted uppercase mb-1">
                  Enter Room Password
                </label>
                <input
                  type="password"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  placeholder="Passcode"
                  autoFocus
                  required
                  className="w-full bg-pulse-surface border border-pulse-border focus:border-pulse-accent rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-pulse-muted/50 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPromptTargetRoom(null)}
                  className="flex-1 py-2 rounded-lg bg-pulse-surface hover:bg-pulse-hover border border-pulse-border text-xs font-mono text-pulse-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!joinPassword.trim()}
                  className="flex-1 py-2 rounded-lg bg-pulse-yellow hover:bg-pulse-yellow/90 disabled:opacity-40 text-xs font-mono font-bold text-black flex items-center justify-center gap-1 shadow-[0_0_12px_rgba(255,214,0,0.2)]"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Unlock & Join</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. STATUS CHANGER MODAL */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-pulse-card border border-pulse-border rounded-xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-pulse-border pb-2">
              <span className="font-bold text-white text-xs font-mono uppercase tracking-wider flex items-center gap-1.5">
                <Smile className="w-4 h-4 text-pulse-accent" />
                Set Presence & Status
              </span>
              <button
                onClick={() => setShowStatusModal(false)}
                className="text-pulse-muted hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            {/* Status Radio Options */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-pulse-muted uppercase">Online Status</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedStatus('online')}
                  className={`p-2 rounded-lg border text-xs font-mono flex items-center gap-2 transition-all ${
                    selectedStatus === 'online'
                      ? 'bg-pulse-green/10 border-pulse-green text-white font-bold'
                      : 'bg-pulse-surface border-pulse-border text-pulse-muted'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-pulse-green" />
                  <span>Online</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedStatus('away')}
                  className={`p-2 rounded-lg border text-xs font-mono flex items-center gap-2 transition-all ${
                    selectedStatus === 'away'
                      ? 'bg-pulse-yellow/10 border-pulse-yellow text-white font-bold'
                      : 'bg-pulse-surface border-pulse-border text-pulse-muted'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-pulse-yellow" />
                  <span>Away</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedStatus('dnd')}
                  className={`p-2 rounded-lg border text-xs font-mono flex items-center gap-2 transition-all ${
                    selectedStatus === 'dnd'
                      ? 'bg-pulse-red/10 border-pulse-red text-white font-bold'
                      : 'bg-pulse-surface border-pulse-border text-pulse-muted'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-pulse-red" />
                  <span>Busy / DND</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedStatus('offline')}
                  className={`p-2 rounded-lg border text-xs font-mono flex items-center gap-2 transition-all ${
                    selectedStatus === 'offline'
                      ? 'bg-pulse-muted/20 border-pulse-muted text-white font-bold'
                      : 'bg-pulse-surface border-pulse-border text-pulse-muted'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-pulse-muted" />
                  <span>Invisible</span>
                </button>
              </div>
            </div>

            {/* Custom Activity Text */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-pulse-muted uppercase">
                What are you doing?
              </label>
              <input
                type="text"
                value={customActivity}
                onChange={(e) => setCustomActivity(e.target.value)}
                placeholder="e.g. ⚡ Benchmarking epoll sockets"
                maxLength={60}
                className="w-full bg-pulse-surface border border-pulse-border focus:border-pulse-accent rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-pulse-muted/50 focus:outline-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowStatusModal(false)}
                className="flex-1 py-2 rounded-lg bg-pulse-surface hover:bg-pulse-hover border border-pulse-border text-xs font-mono text-pulse-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveStatus}
                className="flex-1 py-2 rounded-lg bg-pulse-accent hover:bg-pulse-accent/90 text-xs font-mono font-bold text-black flex items-center justify-center gap-1 shadow-[0_0_12px_rgba(0,240,255,0.2)]"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Status</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
