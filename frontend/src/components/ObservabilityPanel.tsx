import React, { useState } from 'react';
import { Cpu, Activity, Zap, HardDrive, Wifi, Radio, Clock, ShieldCheck, Terminal, Trash2, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { SystemMetrics, TelemetryEvent } from '../types';

interface ObservabilityPanelProps {
  metrics: SystemMetrics | null;
  telemetryEvents: TelemetryEvent[];
  tcpStatus: 'connected' | 'disconnected' | 'error';
  onClose: () => void;
}

export const ObservabilityPanel: React.FC<ObservabilityPanelProps> = ({
  metrics,
  telemetryEvents,
  tcpStatus
}) => {
  const [activeTab, setActiveTab] = useState<'metrics' | 'stream'>('metrics');

  const formatUptime = (secs: number = 0) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return `${h > 0 ? `${h}h ` : ''}${m}m ${s}s`;
  };

  const formatBytes = (bytes: number = 0) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <aside className="w-80 border-l border-pulse-border bg-pulse-card/80 backdrop-blur flex flex-col shrink-0 select-none overflow-hidden font-mono text-xs">
      {/* 1. HEADER */}
      <div className="p-3 border-b border-pulse-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-pulse-accent animate-pulse" />
          <span className="font-bold text-white tracking-wider uppercase text-[11px]">
            System Telemetry
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-pulse-surface border border-pulse-border text-[10px]">
          <span className={`w-1.5 h-1.5 rounded-full ${tcpStatus === 'connected' ? 'bg-pulse-green' : 'bg-pulse-red'}`} />
          <span className="text-pulse-muted">epoll:</span>
          <span className={tcpStatus === 'connected' ? 'text-pulse-green font-bold' : 'text-pulse-red font-bold'}>
            {tcpStatus === 'connected' ? 'LIVE' : 'DOWN'}
          </span>
        </div>
      </div>

      {/* 2. TAB SWITCHER */}
      <div className="flex border-b border-pulse-border bg-pulse-surface/30">
        <button
          onClick={() => setActiveTab('metrics')}
          className={`flex-1 py-2 text-center text-[11px] font-bold uppercase transition-all ${
            activeTab === 'metrics'
              ? 'text-pulse-accent border-b-2 border-pulse-accent bg-pulse-accent/5'
              : 'text-pulse-muted hover:text-white'
          }`}
        >
          Server Gauges
        </button>
        <button
          onClick={() => setActiveTab('stream')}
          className={`flex-1 py-2 text-center text-[11px] font-bold uppercase transition-all flex items-center justify-center gap-1 ${
            activeTab === 'stream'
              ? 'text-pulse-accent border-b-2 border-pulse-accent bg-pulse-accent/5'
              : 'text-pulse-muted hover:text-white'
          }`}
        >
          <Terminal className="w-3 h-3" />
          <span>Raw PCAP ({telemetryEvents.length})</span>
        </button>
      </div>

      {/* 3. CONTENT AREA */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {activeTab === 'metrics' ? (
          <>
            {/* Health & Engine Card */}
            <div className="p-2.5 rounded-lg bg-pulse-surface border border-pulse-border space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-pulse-muted flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-pulse-green" />
                  Engine
                </span>
                <span className="text-white font-bold">Linux epoll (O_NONBLOCK)</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-pulse-muted flex items-center gap-1">
                  <Clock className="w-3 h-3 text-pulse-accent" />
                  Uptime
                </span>
                <span className="text-pulse-accent font-bold">
                  {formatUptime(metrics?.uptime_sec)}
                </span>
              </div>
            </div>

            {/* Connections Metric Card */}
            <div className="p-2.5 rounded-lg bg-pulse-surface border border-pulse-border space-y-2">
              <div className="text-[10px] text-pulse-muted uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Radio className="w-3 h-3 text-pulse-accent" />
                  TCP Connections
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-pulse-card p-2 rounded border border-pulse-border/50">
                  <div className="text-[10px] text-pulse-muted">Active</div>
                  <div className="text-base font-bold text-pulse-green">
                    {metrics?.active_connections ?? 0}
                  </div>
                </div>
                <div className="bg-pulse-card p-2 rounded border border-pulse-border/50">
                  <div className="text-[10px] text-pulse-muted">Total All-Time</div>
                  <div className="text-base font-bold text-white">
                    {metrics?.total_connections ?? 0}
                  </div>
                </div>
              </div>
            </div>

            {/* Throughput & Rates Card */}
            <div className="p-2.5 rounded-lg bg-pulse-surface border border-pulse-border space-y-2">
              <div className="text-[10px] text-pulse-muted uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-pulse-yellow" />
                  Throughput & Ingest
                </span>
                <span className="text-[10px] text-pulse-yellow font-bold">
                  {metrics?.msgs_per_sec?.toFixed(1) ?? '0.0'} msg/s
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-pulse-card p-2 rounded border border-pulse-border/50">
                  <div className="text-[10px] text-pulse-muted">Bandwidth</div>
                  <div className="text-xs font-bold text-pulse-accent truncate">
                    {metrics?.bytes_per_sec ? `${(metrics.bytes_per_sec / 1024).toFixed(1)} KB/s` : '0.0 KB/s'}
                  </div>
                </div>
                <div className="bg-pulse-card p-2 rounded border border-pulse-border/50">
                  <div className="text-[10px] text-pulse-muted">Total Ingest</div>
                  <div className="text-xs font-bold text-white truncate">
                    {formatBytes((metrics?.bytes_received ?? 0) + (metrics?.bytes_sent ?? 0))}
                  </div>
                </div>
              </div>
            </div>

            {/* Message Totals */}
            <div className="p-2.5 rounded-lg bg-pulse-surface border border-pulse-border space-y-2">
              <div className="text-[10px] text-pulse-muted uppercase tracking-wider flex items-center gap-1">
                <Activity className="w-3 h-3 text-pulse-magenta" />
                Message Counters
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                <div className="bg-pulse-card p-2 rounded border border-pulse-border/50">
                  <span className="text-pulse-muted block text-[10px]">Received</span>
                  <span className="font-bold text-white">{metrics?.messages_received ?? 0}</span>
                </div>
                <div className="bg-pulse-card p-2 rounded border border-pulse-border/50">
                  <span className="text-pulse-muted block text-[10px]">Broadcast</span>
                  <span className="font-bold text-pulse-green">{metrics?.messages_sent ?? 0}</span>
                </div>
              </div>
            </div>

            {/* Room Distribution Breakdown */}
            <div className="p-2.5 rounded-lg bg-pulse-surface border border-pulse-border space-y-2">
              <div className="text-[10px] text-pulse-muted uppercase tracking-wider">
                Active Room Distribution
              </div>
              <div className="space-y-1.5 pt-1">
                {metrics?.rooms && metrics.rooms.length > 0 ? (
                  metrics.rooms.map((r) => (
                    <div key={r.name} className="flex items-center justify-between text-[11px]">
                      <span className="text-pulse-muted truncate">#{r.name}</span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-pulse-card rounded-full overflow-hidden">
                          <div
                            className="h-full bg-pulse-accent"
                            style={{
                              width: `${Math.min(100, Math.max(10, (r.users / Math.max(1, metrics.active_connections)) * 100))}%`
                            }}
                          />
                        </div>
                        <span className="text-white font-bold w-4 text-right">{r.users}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-pulse-muted/60 text-[10px] italic">No active rooms</div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Live Raw PCAP Event Stream */
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] text-pulse-muted pb-1 border-b border-pulse-border">
              <span>PCAP Frame Stream</span>
              <span>Latest First</span>
            </div>

            {telemetryEvents.length === 0 ? (
              <div className="text-pulse-muted/60 text-[10px] italic p-4 text-center">
                Awaiting frame traffic...
              </div>
            ) : (
              telemetryEvents.map((ev, idx) => (
                <div
                  key={`${ev.timestamp}-${idx}`}
                  className="p-2 rounded bg-pulse-surface border border-pulse-border/60 space-y-1 font-mono text-[10px]"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-1.5 py-0.2 rounded font-bold text-[9px] flex items-center gap-1 ${
                        ev.direction === 'INBOUND'
                          ? 'bg-pulse-green/10 text-pulse-green border border-pulse-green/30'
                          : 'bg-pulse-accent/10 text-pulse-accent border border-pulse-accent/30'
                      }`}
                    >
                      {ev.direction === 'INBOUND' ? (
                        <ArrowDownLeft className="w-2.5 h-2.5" />
                      ) : (
                        <ArrowUpRight className="w-2.5 h-2.5" />
                      )}
                      {ev.direction}
                    </span>
                    <span className="text-pulse-muted/50">{ev.timestamp}</span>
                  </div>

                  <div className="flex items-center justify-between text-white font-bold">
                    <span className="text-pulse-accent truncate">0x0{ev.type.toString(16).toUpperCase()} {ev.typeName}</span>
                    <span className="text-pulse-muted shrink-0">{ev.length} bytes</span>
                  </div>

                  {ev.payload && (
                    <div className="text-pulse-muted truncate text-[9px] bg-pulse-card p-1 rounded">
                      {ev.payload}
                    </div>
                  )}

                  {ev.rawHex && (
                    <div className="text-[8px] text-pulse-muted/40 font-mono truncate">
                      HEX: {ev.rawHex}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
