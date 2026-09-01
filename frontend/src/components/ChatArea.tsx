import React, { useState, useRef, useEffect } from 'react';
import { Send, Hash, MessageSquare, Terminal, AlertTriangle, ArrowDown, LogOut, AtSign, Bell, ArrowLeft } from 'lucide-react';
import { ChatMessage, MessageType, UserItem } from '../types';

interface ChatAreaProps {
  currentRoom: string;
  activeDmUser: string | null;
  currentUsername: string;
  messages: ChatMessage[];
  users?: UserItem[];
  onSendMessage: (text: string) => void;
  onLeaveRoom: () => void;
  onClearDm: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  currentRoom,
  activeDmUser,
  currentUsername,
  messages,
  users = [],
  onSendMessage,
  onLeaveRoom,
  onClearDm
}) => {
  const [inputText, setInputText] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Filter messages strictly relevant to the currently viewed room or active DM
  const filteredMessages = messages.filter((msg) => {
    // 1. Direct Message Mode (Strict 1-on-1 private filter)
    if (activeDmUser) {
      if (!msg.isPrivate) return false;
      const dmTarget = activeDmUser.toLowerCase();
      const myName = currentUsername.toLowerCase();
      const sender = msg.sender.toLowerCase();
      const target = msg.targetUser?.toLowerCase();

      return (
        sender === dmTarget ||
        target === dmTarget ||
        (sender === 'you' && target === dmTarget) ||
        (sender === myName && target === dmTarget)
      );
    }

    // 2. Error messages
    if (msg.isError) return true;

    // 3. Room Messages (Exclude private DMs from room chat feed)
    if (msg.isPrivate) return false;

    if (msg.room) {
      return msg.room.toLowerCase() === currentRoom.toLowerCase();
    }

    // Generic system notification (only shown in #general)
    if (msg.isSystem) {
      return currentRoom.toLowerCase() === 'general';
    }

    return false;
  });

  // Scroll to bottom on new message
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredMessages, autoScroll]);

  // Handle scroll detection
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isBottom);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);

    const cursor = e.target.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const lastAtMatch = textBeforeCursor.match(/@([\w-]*)$/);

    if (lastAtMatch) {
      setMentionFilter(lastAtMatch[1].toLowerCase());
      setShowMentionPicker(true);
    } else {
      setShowMentionPicker(false);
    }
  };

  const insertMention = (username: string) => {
    const cursor = inputRef.current?.selectionStart || inputText.length;
    const textBeforeCursor = inputText.slice(0, cursor);
    const textAfterCursor = inputText.slice(cursor);
    const updatedBefore = textBeforeCursor.replace(/@([\w-]*)$/, `@${username} `);

    setInputText(updatedBefore + textAfterCursor);
    setShowMentionPicker(false);
    inputRef.current?.focus();
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText('');
      setShowCommands(false);
      setShowMentionPicker(false);
    }
  };

  const insertCommand = (cmd: string) => {
    setInputText(cmd);
    setShowCommands(false);
    inputRef.current?.focus();
  };

  // Format text to highlight @mentions
  const renderMessageText = (text: string, isMentioned?: boolean) => {
    const parts = text.split(/(@[\w-]+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        const handle = part.substring(1).toLowerCase();
        const isMe = handle === currentUsername.toLowerCase();
        return (
          <span
            key={i}
            className={`px-1 py-0.2 rounded font-mono font-bold inline-flex items-center gap-0.5 ${
              isMe
                ? 'bg-pulse-accent text-black font-extrabold shadow-[0_0_8px_rgba(0,240,255,0.4)]'
                : 'bg-pulse-accent/20 text-pulse-accent border border-pulse-accent/30'
            }`}
          >
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const filteredUsersForMention = users.filter((u) =>
    u.username.toLowerCase().includes(mentionFilter) ||
    u.displayName?.toLowerCase().includes(mentionFilter)
  );

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-pulse-bg relative">
      {/* 1. CHAT HEADER */}
      <div className="h-12 border-b border-pulse-border bg-pulse-surface/30 px-4 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0">
          {activeDmUser ? (
            <>
              <button
                onClick={onClearDm}
                className="p-1 rounded hover:bg-pulse-surface text-pulse-muted hover:text-white mr-1 transition-colors"
                title="Back to Room"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="w-6 h-6 rounded bg-pulse-magenta/10 border border-pulse-magenta/40 text-pulse-magenta flex items-center justify-center">
                <MessageSquare className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-sm font-bold text-white font-mono flex items-center gap-2">
                  Direct Message: <span className="text-pulse-magenta font-bold">@{activeDmUser}</span>
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="w-6 h-6 rounded bg-pulse-surface border border-pulse-border text-pulse-accent flex items-center justify-center">
                <Hash className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white font-mono">#{currentRoom}</span>
                <span className="text-xs text-pulse-muted hidden sm:inline font-mono">
                  (Isolated TCP Room Channel)
                </span>
              </div>
            </>
          )}
        </div>

        {/* Room Action Badges */}
        <div className="flex items-center gap-2">
          {activeDmUser ? (
            <button
              onClick={onClearDm}
              className="text-xs font-mono px-2.5 py-1 rounded bg-pulse-surface hover:bg-pulse-card border border-pulse-border text-pulse-muted hover:text-white transition-colors"
            >
              Back to #{currentRoom}
            </button>
          ) : (
            currentRoom.toLowerCase() !== 'general' && (
              <button
                onClick={onLeaveRoom}
                className="text-xs font-mono px-2 py-1 rounded bg-pulse-surface hover:bg-pulse-red/20 border border-pulse-border hover:border-pulse-red text-pulse-muted hover:text-pulse-red transition-all flex items-center gap-1"
                title="Leave room and return to #general"
              >
                <LogOut className="w-3 h-3" />
                <span>Leave Room</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* 2. CHAT MESSAGES FEED */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-2.5 font-mono min-h-0 select-text"
      >
        {filteredMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-pulse-muted">
            <div className="w-12 h-12 rounded-xl bg-pulse-surface border border-pulse-border flex items-center justify-center mb-3 text-pulse-accent">
              {activeDmUser ? <MessageSquare className="w-6 h-6 text-pulse-magenta" /> : <Hash className="w-6 h-6" />}
            </div>
            <p className="text-sm font-bold text-white mb-1">
              {activeDmUser ? `Direct Conversation with @${activeDmUser}` : `Welcome to #${currentRoom}`}
            </p>
            <p className="text-xs max-w-sm">
              {activeDmUser
                ? `Send a private direct message to @${activeDmUser}. Only you and @${activeDmUser} can see these messages.`
                : `This is the start of the #${currentRoom} channel. All messages are streamed over raw POSIX sockets.`}
            </p>
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const isMe =
              msg.sender.toLowerCase() === currentUsername.toLowerCase() ||
              msg.sender.toLowerCase() === 'you';

            // 1. System Notification Message
            if (msg.isSystem) {
              return (
                <div
                  key={msg.id}
                  className="flex items-center gap-2 py-1 px-3 rounded-lg bg-pulse-surface/30 border border-pulse-border/40 text-xs text-pulse-muted text-left"
                >
                  <Terminal className="w-3.5 h-3.5 text-pulse-accent shrink-0" />
                  <div className="flex-1 min-w-0 truncate">
                    <span className="text-pulse-muted/90">{msg.text}</span>
                  </div>
                  <span className="text-[10px] text-pulse-muted/50 shrink-0">{msg.timestamp}</span>
                </div>
              );
            }

            // 2. Error Message
            if (msg.isError) {
              return (
                <div
                  key={msg.id}
                  className="flex items-start gap-2 py-1 px-3 rounded-lg bg-pulse-red/10 border border-pulse-red/30 text-xs text-pulse-red text-left"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">{msg.text}</div>
                  <span className="text-[10px] opacity-70 shrink-0">{msg.timestamp}</span>
                </div>
              );
            }

            // 3. Private Direct Message (DM)
            if (msg.isPrivate) {
              return (
                <div
                  key={msg.id}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    isMe
                      ? 'bg-pulse-surface/60 border-pulse-magenta/40 shadow-[0_0_10px_rgba(255,0,127,0.08)]'
                      : 'bg-pulse-magenta/15 border-pulse-magenta/50 shadow-[0_0_12px_rgba(255,0,127,0.15)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 text-xs text-pulse-magenta font-bold">
                      <MessageSquare className="w-3 h-3" />
                      <span>{isMe ? 'You' : `@${msg.sender}`}</span>
                    </div>
                    <span className="text-[10px] text-pulse-muted">{msg.timestamp}</span>
                  </div>
                  <p className="text-xs text-white break-words">{msg.text}</p>
                </div>
              );
            }

            // 4. Standard Room Chat Message
            return (
              <div
                key={msg.id}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  msg.isMentioned
                    ? 'bg-pulse-accent/15 border-pulse-accent shadow-[0_0_15px_rgba(0,240,255,0.2)]'
                    : isMe
                    ? 'bg-pulse-card border-pulse-accent/30 shadow-[0_0_10px_rgba(0,240,255,0.05)]'
                    : 'bg-pulse-surface/40 border-pulse-border hover:border-pulse-hover'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {msg.avatarUrl ? (
                      <img
                        src={msg.avatarUrl}
                        alt="avatar"
                        className="w-4 h-4 rounded-full bg-pulse-card border border-pulse-border"
                      />
                    ) : null}
                    <span
                      className={`text-xs font-bold ${
                        isMe ? 'text-pulse-accent' : 'text-white'
                      }`}
                    >
                      @{msg.sender}
                    </span>
                    {msg.isMentioned && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-pulse-accent text-black font-extrabold flex items-center gap-0.5 shadow">
                        <Bell className="w-2.5 h-2.5" />
                        MENTIONED
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-pulse-muted/60">{msg.timestamp}</span>
                </div>
                <p className="text-xs text-pulse-muted/90 break-words leading-relaxed pl-1">
                  {renderMessageText(msg.text, msg.isMentioned)}
                </p>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 3. MENTION AUTOCOMPLETE POPUP */}
      {showMentionPicker && filteredUsersForMention.length > 0 && (
        <div className="absolute bottom-16 left-4 z-40 w-64 bg-pulse-card border border-pulse-accent/40 rounded-xl shadow-2xl p-1.5 space-y-0.5 animate-in fade-in">
          <div className="px-2 py-1 text-[10px] font-mono text-pulse-muted uppercase tracking-wider flex items-center gap-1 border-b border-pulse-border/50 mb-1">
            <AtSign className="w-3 h-3 text-pulse-accent" />
            Mention User
          </div>
          <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1">
            {filteredUsersForMention.map((u) => (
              <button
                key={u.username}
                type="button"
                onClick={() => insertMention(u.username)}
                className="w-full px-2 py-1.5 rounded-lg hover:bg-pulse-surface flex items-center gap-2 text-left transition-colors group"
              >
                <div className="w-2 h-2 rounded-full bg-pulse-green shrink-0" />
                <div className="truncate flex-1">
                  <span className="text-xs font-mono font-bold text-white group-hover:text-pulse-accent">
                    @{u.username}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4. SLASH COMMAND HELPER CHIPS */}
      <div className="px-4 py-1.5 border-t border-pulse-border/50 bg-pulse-surface/20 flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono select-none">
        <span className="text-pulse-muted text-[10px] uppercase mr-1">Quick:</span>
        <button
          type="button"
          onClick={() => insertCommand('/join ')}
          className="px-2 py-0.5 rounded bg-pulse-surface hover:bg-pulse-card border border-pulse-border text-pulse-accent hover:border-pulse-accent transition-all"
        >
          /join &lt;room&gt; [password]
        </button>
        <button
          type="button"
          onClick={() => insertCommand('/msg ')}
          className="px-2 py-0.5 rounded bg-pulse-surface hover:bg-pulse-card border border-pulse-border text-pulse-magenta hover:border-pulse-magenta transition-all"
        >
          /msg &lt;user&gt;
        </button>
        <button
          type="button"
          onClick={() => insertCommand('/rooms')}
          className="px-2 py-0.5 rounded bg-pulse-surface hover:bg-pulse-card border border-pulse-border text-pulse-muted hover:text-white transition-all"
        >
          /rooms
        </button>
        <button
          type="button"
          onClick={() => insertCommand('/users')}
          className="px-2 py-0.5 rounded bg-pulse-surface hover:bg-pulse-card border border-pulse-border text-pulse-muted hover:text-white transition-all"
        >
          /users
        </button>
        <button
          type="button"
          onClick={() => insertCommand('/help')}
          className="px-2 py-0.5 rounded bg-pulse-surface hover:bg-pulse-card border border-pulse-border text-pulse-muted hover:text-white transition-all"
        >
          /help
        </button>
      </div>

      {/* 5. INPUT FIELD */}
      <form onSubmit={handleSend} className="p-3 border-t border-pulse-border bg-pulse-surface/40">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={handleInputChange}
              placeholder={
                activeDmUser
                  ? `Direct message @${activeDmUser}... (Enter to send)`
                  : `Message #${currentRoom}... (type @ to mention)`
              }
              className="w-full bg-pulse-card border border-pulse-border focus:border-pulse-accent rounded-xl px-4 py-2.5 text-xs font-mono text-white placeholder-pulse-muted/50 focus:outline-none focus:ring-1 focus:ring-pulse-accent transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 bg-pulse-accent text-black rounded-xl hover:bg-pulse-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_0_12px_rgba(0,240,255,0.2)] shrink-0"
            title="Send (Enter)"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </main>
  );
};
