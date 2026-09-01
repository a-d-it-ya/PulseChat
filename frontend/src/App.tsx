import React, { useState } from 'react';
import { usePulseChat } from './hooks/usePulseChat';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { ObservabilityPanel } from './components/ObservabilityPanel';
import { RegistrationModal } from './components/RegistrationModal';
import { Toast } from './components/Toast';

export function App() {
  const [observabilityOpen, setObservabilityOpen] = useState(true);

  const {
    wsUrl,
    updateWsUrl,
    wsStatus,
    tcpStatus,
    profile,
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
    login,
    logout,
    updateStatus,
    joinRoom,
    leaveRoom,
    sendMessage
  } = usePulseChat();

  return (
    <div className="h-screen w-screen flex flex-col bg-pulse-bg text-pulse-text overflow-hidden">
      {/* 1. TOP HEADER */}
      <Header
        wsUrl={wsUrl}
        wsStatus={wsStatus}
        tcpStatus={tcpStatus}
        profile={profile}
        isRegistered={isRegistered}
        observabilityOpen={observabilityOpen}
        onToggleObservability={() => setObservabilityOpen(!observabilityOpen)}
        onUpdateWsUrl={updateWsUrl}
        onLogout={logout}
        uptimeSec={metrics?.uptime_sec}
      />

      {/* 2. POPUP TOAST NOTIFICATIONS */}
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* 3. MAIN 3-PANEL LAYOUT */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Sidebar: Rooms, Online Users & Direct Messages */}
        <Sidebar
          currentRoom={currentRoom}
          rooms={rooms}
          users={users}
          messages={messages}
          profile={profile}
          activeDmUser={activeDmUser}
          onSelectRoom={(r, password) => {
            joinRoom(r, password);
            setActiveDmUser(null);
          }}
          onSelectDmUser={(u) => setActiveDmUser(u)}
          onJoinRoom={(r, password) => joinRoom(r, password)}
          onUpdateStatus={updateStatus}
          onLogout={logout}
        />

        {/* Center: Live Chat Feed & Inputs */}
        <ChatArea
          currentRoom={currentRoom}
          activeDmUser={activeDmUser}
          currentUsername={profile?.username || ''}
          messages={messages}
          users={users}
          onSendMessage={sendMessage}
          onLeaveRoom={leaveRoom}
          onClearDm={() => setActiveDmUser(null)}
        />

        {/* Right Panel: Live Observability & Telemetry */}
        {observabilityOpen && (
          <ObservabilityPanel
            metrics={metrics}
            telemetryEvents={telemetryEvents}
            tcpStatus={tcpStatus}
            onClose={() => setObservabilityOpen(false)}
          />
        )}
      </div>

      {/* 4. USER AUTHENTICATION & LOGIN MODAL */}
      {!isRegistered && (
        <RegistrationModal
          onLogin={login}
          error={registrationError}
          tcpStatus={tcpStatus}
        />
      )}
    </div>
  );
}

export default App;
