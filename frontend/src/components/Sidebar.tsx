import React, { useState } from 'react';
import { Hash, Users, Plus, MessageSquare, Radio, Shield, Smile, Edit3, Check, LogOut, Settings } from 'lucide-react';
import { RoomItem, UserItem, UserProfile, UserStatus } from '../types';

interface SidebarProps {
  currentRoom: string;
  rooms: RoomItem[];
  users: UserItem[];
  profile: UserProfile | null;
  activeDmUser: string | null;
  onSelectRoom: (roomName: string) => void;
  onSelectDmUser: (username: string | null) => void;
  onJoinRoom: (roomName: string) => void;
  onUpdateStatus: (status: UserStatus, activityText?: string) => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRoom,
  rooms,
  users,
  profile,
  activeDmUser,
  onSelectRoom,
  onSelectDmUser,
  onJoinRoom,
  onUpdateStatus,
  onLogout
}) => {
  const [newRoomInput, setNewRoomInput] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [customActivity, setCustomActivity] = useState(profile?.activityText || '');
  const [selectedStatus, setSelectedStatus] = useState<UserStatus>(profile?.status || 'online');

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (newRoomInput.trim()) {
      onJoinRoom(newRoomInput.trim());
      setNewRoomInput('');
      setIsCreatingRoom(false);
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

  const displayRooms = rooms.length > 0 ? rooms : [{ name: 'general', users: 1 }];

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
            onClick={() => setIsCreatingRoom(!isCreatingRoom)}
            className="p-1 rounded hover:bg-pulse-surface text-pulse-muted hover:text-pulse-accent transition-colors"
            title="Create / Join Room"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {isCreatingRoom && (
          <form onSubmit={handleCreateRoom} className="mb-2">
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newRoomInput}
                onChange={(e) => setNewRoomInput(e.target.value)}
                placeholder="room-name"
                autoFocus
                className="w-full bg-pulse-surface border border-pulse-accent/50 rounded px-2 py-1 text-xs font-mono text-white placeholder-pulse-muted/50 focus:outline-none"
              />
              <button
                type="submit"
                className="px-2 py-1 bg-pulse-accent text-black font-mono font-bold text-xs rounded hover:bg-pulse-accent/90"
              >
                Join
              </button>
            </div>
          </form>
        )}

        <div className="space-y-0.5 overflow-y-auto max-h-48 pr-1">
          {displayRooms.map((room) => {
            const isActive = !activeDmUser && currentRoom.toLowerCase() === room.name.toLowerCase();
            return (
              <button
                key={room.name}
                onClick={() => onSelectRoom(room.name)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  isActive
                    ? 'bg-pulse-accent/10 text-pulse-accent border border-pulse-accent/30 font-semibold shadow-[0_0_10px_rgba(0,240,255,0.1)]'
                    : 'text-pulse-muted hover:bg-pulse-surface hover:text-white border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className={isActive ? 'text-pulse-accent' : 'text-pulse-muted/60'}>#</span>
                  <span className="truncate">{room.name}</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-pulse-surface border border-pulse-border text-pulse-muted">
                  {room.users}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. ONLINE USERS & PRESENCE SECTION */}
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
                  className={`w-full flex flex-col px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all text-left ${
                    isDmActive
                      ? 'bg-pulse-magenta/10 text-pulse-magenta border border-pulse-magenta/30 font-semibold shadow-[0_0_10px_rgba(255,0,127,0.15)]'
                      : isMe
                      ? 'bg-pulse-surface/30 border border-pulse-border/50 text-white cursor-default'
                      : 'text-pulse-muted hover:bg-pulse-surface hover:text-white border border-transparent'
                  }`}
                  title={isMe ? 'You' : `Click to DM @${u.username}`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2 truncate">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(u.status)}`} />
                      <span className="truncate font-medium text-white">{u.displayName || u.username}</span>
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

                  {/* Activity text / What they are doing */}
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

      {/* 3. USER PROFILE & STATUS FOOTER */}
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
                {profile?.displayName?.charAt(0).toUpperCase() || 'U'}
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
              {profile?.displayName || profile?.username}
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

      {/* 4. STATUS CHANGER MODAL */}
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
