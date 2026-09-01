import React, { useState, useRef, useEffect } from 'react';
import { Send, Hash, MessageSquare, Terminal, AlertTriangle, ArrowDown, LogOut } from 'lucide-react';
import { ChatMessage, MessageType } from '../types';

interface ChatAreaProps {
  currentRoom: string;
  activeDmUser: string | null;
  currentUsername: string;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onLeaveRoom: () => void;
  onClearDm: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  currentRoom,
  activeDmUser,
  currentUsername,
  messages,
  onSendMessage,
  onLeaveRoom,
  onClearDm
}) => {
  const [inputText, setInputText] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Filter messages relevant to current room / DM or system notifications
  const filteredMessages = messages.filter((msg) => {
    if (msg.isSystem || msg.isError) return true;
    if (activeDmUser) {
      return msg.isPrivate;
    }
    // Room chat
    return msg.room?.toLowerCase() === currentRoom.toLowerCase() || msg.isPrivate;
  });

  // Scroll to bottom on new message if autoScroll enabled
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

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText('');
      setShowCommands(false);
    }
  };

  const insertCommand = (cmd: string) => {
    setInputText(cmd);
    setShowCommands(false);
  };

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-pulse-bg relative">
      {/* 1. CHAT HEADER */}
      <div className="h-12 border-b border-pulse-border bg-pulse-surface/30 px-4 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0">
          {activeDmUser ? (
            <>
              <div className="w-6 h-6 rounded bg-pulse-magenta/10 border border-pulse-magenta/40 text-pulse-magenta flex items-center justify-center">
                <MessageSquare className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-sm font-bold text-white font-mono flex items-center gap-2">
                  Direct Message: <span className="text-pulse-magenta">{activeDmUser}</span>
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

        <div className="flex items-center gap-2">
          {activeDmUser ? (
            <button
              onClick={onClearDm}
              className="flex items-center gap-1 text-xs font-mono text-pulse-muted hover:text-white px-2 py-1 rounded bg-pulse-surface border border-pulse-border"
            >
              <LogOut className="w-3 h-3" />
              <span>Back to #{currentRoom}</span>
            </button>
          ) : currentRoom !== 'general' ? (
            <button
              onClick={onLeaveRoom}
              className="flex items-center gap-1 text-xs font-mono text-pulse-yellow hover:text-white px-2 py-1 rounded bg-pulse-surface border border-pulse-border hover:border-pulse-yellow/50 transition-colors"
            >
              <LogOut className="w-3 h-3" />
              <span>Leave Room</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* 2. MESSAGE FEED */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3 font-sans min-h-0"
      >
        {filteredMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-pulse-muted">
            <Terminal className="w-10 h-10 mb-3 text-pulse-accent/40" />
            <h3 className="text-sm font-mono font-bold text-white">Channel Initialized</h3>
            <p className="text-xs max-w-sm mt-1">
              Start typing below to broadcast messages over the Linux POSIX socket stream.
            </p>
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const isMe = msg.sender.toLowerCase() === currentUsername.toLowerCase();

            // 2A. System / Notification Message
            if (msg.isSystem) {
              return (
                <div
                  key={msg.id}
                  className="py-1 px-3 rounded-lg bg-pulse-card border border-pulse-border/70 flex items-start gap-2 text-xs font-mono text-pulse-muted"
                >
                  <Terminal className="w-3.5 h-3.5 text-pulse-accent shrink-0 mt-0.5" />
                  <span className="text-pulse-text break-words flex-1">{msg.text}</span>
                  <span className="text-[10px] text-pulse-muted/50 shrink-0">{msg.timestamp}</span>
                </div>
              );
            }

            // 2B. Error Message
            if (msg.isError) {
              return (
                <div
                  key={msg.id}
                  className="py-2 px-3 rounded-lg bg-pulse-red/10 border border-pulse-red/30 flex items-start gap-2 text-xs font-mono text-pulse-red"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="break-words flex-1">{msg.text}</span>
                  <span className="text-[10px] text-pulse-red/70 shrink-0">{msg.timestamp}</span>
                </div>
              );
            }

            // 2C. Direct Message (Private)
            if (msg.isPrivate) {
              return (
                <div
                  key={msg.id}
                  className={`p-3 rounded-xl border flex flex-col gap-1 max-w-[85%] ${
                    isMe
                      ? 'ml-auto bg-pulse-magenta/10 border-pulse-magenta/40 text-white'
                      : 'mr-auto bg-pulse-card border-pulse-magenta/30 text-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-xs font-mono">
                    <span className="text-pulse-magenta font-bold flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3" />
                      {msg.sender}
                    </span>
                    <span className="text-[10px] text-pulse-muted font-mono">{msg.timestamp}</span>
                  </div>
                  <p className="text-sm font-sans text-pulse-text break-words whitespace-pre-wrap">
                    {msg.text}
                  </p>
                </div>
              );
            }

            // 2D. Standard Chat Message
            return (
              <div
                key={msg.id}
                className={`p-3 rounded-xl border flex flex-col gap-1 max-w-[85%] transition-all ${
                  isMe
                    ? 'ml-auto bg-pulse-accent/10 border-pulse-accent/40 text-white shadow-[0_0_12px_rgba(0,240,255,0.05)]'
                    : 'mr-auto bg-pulse-card border-pulse-border text-white'
                }`}
              >
                <div className="flex items-center justify-between gap-3 text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-bold ${isMe ? 'text-pulse-accent' : 'text-pulse-green'}`}>
                      {msg.sender}
                    </span>
                    {msg.room && msg.room !== currentRoom && (
                      <span className="text-[10px] px-1 py-0.2 rounded bg-pulse-surface text-pulse-muted border border-pulse-border">
                        #{msg.room}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-pulse-muted/60 font-mono">{msg.timestamp}</span>
                </div>
                <p className="text-sm font-sans text-pulse-text break-words whitespace-pre-wrap">
                  {msg.text}
                </p>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Auto-scroll prompt if scrolled up */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-pulse-card border border-pulse-accent text-pulse-accent text-xs font-mono flex items-center gap-1 shadow-lg hover:bg-pulse-surface"
        >
          <ArrowDown className="w-3 h-3" />
          <span>New messages below</span>
        </button>
      )}

      {/* 3. INPUT AREA & SLASH COMMAND HELPER */}
      <div className="p-3 border-t border-pulse-border bg-pulse-card/40">
        {/* Command Helper Pills */}
        <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1 text-[11px] font-mono select-none">
          <span className="text-pulse-muted/50 text-[10px] uppercase shrink-0">Commands:</span>
          <button
            type="button"
            onClick={() => insertCommand('/join ')}
            className="px-2 py-0.5 rounded bg-pulse-surface hover:bg-pulse-hover border border-pulse-border text-pulse-accent shrink-0"
          >
            /join &lt;room&gt;
          </button>
          <button
            type="button"
            onClick={() => insertCommand('/leave')}
            className="px-2 py-0.5 rounded bg-pulse-surface hover:bg-pulse-hover border border-pulse-border text-pulse-muted hover:text-white shrink-0"
          >
            /leave
          </button>
          <button
            type="button"
            onClick={() => insertCommand('/msg ')}
            className="px-2 py-0.5 rounded bg-pulse-surface hover:bg-pulse-hover border border-pulse-border text-pulse-magenta shrink-0"
          >
            /msg &lt;user&gt; &lt;text&gt;
          </button>
          <button
            type="button"
            onClick={() => insertCommand('/rooms')}
            className="px-2 py-0.5 rounded bg-pulse-surface hover:bg-pulse-hover border border-pulse-border text-pulse-muted hover:text-white shrink-0"
          >
            /rooms
          </button>
          <button
            type="button"
            onClick={() => insertCommand('/users')}
            className="px-2 py-0.5 rounded bg-pulse-surface hover:bg-pulse-hover border border-pulse-border text-pulse-muted hover:text-white shrink-0"
          >
            /users
          </button>
          <button
            type="button"
            onClick={() => insertCommand('/help')}
            className="px-2 py-0.5 rounded bg-pulse-surface hover:bg-pulse-hover border border-pulse-border text-pulse-muted hover:text-white shrink-0"
          >
            /help
          </button>
        </div>

        <form onSubmit={handleSend} className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                activeDmUser
                  ? `Message @${activeDmUser} (Private DM)...`
                  : `Message #${currentRoom} or type /command...`
              }
              className="w-full bg-pulse-surface border border-pulse-border focus:border-pulse-accent rounded-lg px-3.5 py-2.5 text-sm font-sans text-white placeholder-pulse-muted/50 focus:outline-none focus:ring-1 focus:ring-pulse-accent transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="px-4 py-2.5 bg-pulse-accent hover:bg-pulse-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold text-sm rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-[0_0_12px_rgba(0,240,255,0.15)] shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </main>
  );
};
