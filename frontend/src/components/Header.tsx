import React from 'react';
import { Activity, Cpu, PanelRightOpen, PanelRightClose, Mail, ShieldCheck, LogOut } from 'lucide-react';
import { UserProfile } from '../types';

interface HeaderProps {
  wsUrl: string;
  wsStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  tcpStatus: 'connected' | 'disconnected' | 'error';
  profile: UserProfile | null;
  isRegistered: boolean;
  observabilityOpen: boolean;
  onToggleObservability: () => void;
  onUpdateWsUrl: (url: string) => void;
  onLogout: () => void;
  uptimeSec?: number;
}

export const Header: React.FC<HeaderProps> = ({
  wsStatus,
  tcpStatus,
  profile,
  isRegistered,
  observabilityOpen,
  onToggleObservability,
  onLogout,
  uptimeSec = 0
}) => {
  const isOnline = tcpStatus === 'connected' && wsStatus === 'connected';

  return (
    <header className="h-14 border-b border-pulse-border bg-pulse-card/80 backdrop-blur px-4 flex items-center justify-between shrink-0 select-none">
      {/* Brand & Tagline */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-pulse-surface border border-pulse-accent/30 flex items-center justify-center text-pulse-accent shadow-[0_0_12px_rgba(0,240,255,0.2)]">
          <Activity className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold tracking-tight text-white flex items-center gap-1.5">
              PULSE<span className="text-pulse-accent">CHAT</span>
            </span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-pulse-surface border border-pulse-border text-pulse-accent">
              EPOLL REACTOR V2
            </span>
          </div>
          <p className="text-[11px] text-pulse-muted hidden sm:block">
            Real-time messaging, built from the socket up.
          </p>
        </div>
      </div>

      {/* Connection Badges & Controls */}
      <div className="flex items-center gap-3">
        {/* TCP POSIX Status Pill */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-pulse-surface border border-pulse-border text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-pulse-green animate-pulse' : 'bg-pulse-red'
              }`}
            />
            <span className="text-pulse-muted text-[11px]">POSIX TCP:</span>
            <span className={isOnline ? 'text-pulse-green font-bold' : 'text-pulse-red font-medium'}>
              {isOnline ? '127.0.0.1:9000 (LIVE)' : 'CONNECTING...'}
            </span>
          </div>
        </div>

        {/* User Profile Badge */}
        {isRegistered && profile && (
          <div className="flex items-center gap-2 pl-2 border-l border-pulse-border">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt="avatar"
                className="w-6 h-6 rounded-full bg-pulse-surface border border-pulse-border"
              />
            ) : (
              <div className="w-6 h-6 rounded bg-pulse-accent/10 border border-pulse-accent/40 text-pulse-accent flex items-center justify-center text-xs font-mono font-bold">
                {profile.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="hidden sm:block text-left">
              <div className="text-xs font-mono font-bold text-white leading-tight flex items-center gap-1">
                <span>{profile.displayName}</span>
                {profile.provider === 'google' && (
                  <span title="Signed in with Google">
                    <Mail className="w-2.5 h-2.5 text-pulse-red" />
                  </span>
                )}
              </div>
              <div className="text-[9px] font-mono text-pulse-muted truncate max-w-[120px]">
                {profile.email || `@${profile.username}`}
              </div>
            </div>
            <button
              onClick={onLogout}
              className="p-1.5 rounded-lg hover:bg-pulse-red/10 text-pulse-muted hover:text-pulse-red transition-colors ml-1"
              title="Log Out & Switch Account"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Toggle Observability Button */}
        <button
          onClick={onToggleObservability}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
            observabilityOpen
              ? 'bg-pulse-accent/10 border-pulse-accent text-pulse-accent shadow-[0_0_10px_rgba(0,240,255,0.15)]'
              : 'bg-pulse-surface border-pulse-border text-pulse-muted hover:text-white hover:border-pulse-hover'
          }`}
          title="Toggle System Observability Telemetry"
        >
          <Cpu className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">TELEMETRY</span>
          {observabilityOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
        </button>
      </div>
    </header>
  );
};
