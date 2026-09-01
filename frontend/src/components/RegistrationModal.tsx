import React, { useState, useEffect, useRef } from 'react';
import { Activity, ArrowRight, AlertCircle, User, Shield, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import { UserProfile } from '../types';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          prompt: (callback?: any) => void;
          renderButton: (element: HTMLElement, config: any) => void;
          disableAutoSelect: () => void;
        };
        oauth2: {
          initTokenClient: (config: any) => {
            requestAccessToken: () => void;
          };
        };
      };
    };
  }
}

interface RealGoogleUser {
  email: string;
  name: string;
  avatarUrl: string;
}

interface RegistrationModalProps {
  onLogin: (profile: UserProfile) => void;
  error: string | null;
  tcpStatus: 'connected' | 'disconnected' | 'error';
}

export const RegistrationModal: React.FC<RegistrationModalProps> = ({
  onLogin,
  error,
  tcpStatus
}) => {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  const [step, setStep] = useState<'auth' | 'set_username' | 'local_user'>('auth');
  const [googleUser, setGoogleUser] = useState<RealGoogleUser | null>(null);
  const [chosenUsername, setChosenUsername] = useState('');
  const [localUsername, setLocalUsername] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  // Decode JWT credential from Google Identity Services
  const handleCredentialResponse = (response: any) => {
    try {
      if (!response || !response.credential) {
        setAuthError('No credential returned by Google.');
        return;
      }

      const base64Url = response.credential.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const payload = JSON.parse(jsonPayload);

      const verifiedUser: RealGoogleUser = {
        email: payload.email,
        name: payload.name || payload.email.split('@')[0],
        avatarUrl: payload.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${payload.email}`
      };

      setGoogleUser(verifiedUser);
      const suggested = payload.email
        .split('@')[0]
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .toLowerCase();
      setChosenUsername(suggested);
      setAuthError(null);
      setStep('set_username');
    } catch (err: any) {
      console.error('Failed to parse Google JWT:', err);
      setAuthError('Failed to process Google login response.');
    }
  };

  // Launch Google OAuth2 Popup (works reliably across Chrome, Edge, Brave, Safari)
  const handleLaunchGooglePopup = () => {
    if (!googleClientId.trim()) {
      setAuthError('Google Sign-In is not configured. Developer must set VITE_GOOGLE_CLIENT_ID in frontend/.env.');
      return;
    }

    if (window.google?.accounts?.oauth2) {
      try {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: googleClientId.trim(),
          scope: 'email profile openid',
          callback: async (tokenResponse: any) => {
            if (tokenResponse.error) {
              setAuthError(`Google Sign-In error: ${tokenResponse.error}`);
              return;
            }
            if (tokenResponse.access_token) {
              try {
                const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
                });
                const data = await res.json();
                if (data.email) {
                  const verifiedUser: RealGoogleUser = {
                    email: data.email,
                    name: data.name || data.email.split('@')[0],
                    avatarUrl: data.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${data.email}`
                  };
                  setGoogleUser(verifiedUser);
                  setChosenUsername(
                    data.email
                      .split('@')[0]
                      .replace(/[^a-zA-Z0-9_-]/g, '_')
                      .toLowerCase()
                  );
                  setAuthError(null);
                  setStep('set_username');
                }
              } catch {
                setAuthError('Failed to fetch user profile from Google.');
              }
            }
          }
        });
        tokenClient.requestAccessToken({ prompt: 'select_account' });
      } catch (err: any) {
        setAuthError(err.message || 'Google OAuth failed to start.');
      }
    } else {
      setAuthError('Google SDK is loading. Please click again in a moment.');
    }
  };

  // Initialize official Google Identity Services with Chrome FedCM compatibility
  useEffect(() => {
    if (step !== 'auth' || !googleClientId.trim()) return;

    const initGSI = () => {
      if (window.google?.accounts?.id && googleButtonRef.current) {
        try {
          window.google.accounts.id.initialize({
            client_id: googleClientId.trim(),
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
            use_fedcm_for_prompt: true
          });

          googleButtonRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(googleButtonRef.current, {
            theme: 'filled_blue',
            size: 'large',
            type: 'standard',
            shape: 'pill',
            text: 'continue_with',
            logo_alignment: 'left',
            width: 320
          });
        } catch (e) {
          console.warn('Google GSI init notice:', e);
        }
      }
    };

    const timer = setTimeout(initGSI, 300);
    return () => clearTimeout(timer);
  }, [step, googleClientId]);

  // Submit Final User Profile
  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const handle = chosenUsername.trim().toLowerCase();
    if (!handle || !googleUser) return;

    onLogin({
      username: handle,
      displayName: googleUser.name,
      email: googleUser.email,
      avatarUrl: googleUser.avatarUrl,
      provider: 'google',
      status: 'online',
      activityText: '⚡ Active on PulseChat'
    });
  };

  const handleLocalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const handle = localUsername.trim().toLowerCase();
    if (!handle) return;

    onLogin({
      username: handle,
      displayName: localUsername.trim(),
      provider: 'local',
      status: 'online',
      activityText: '💻 Local Developer'
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-pulse-card border border-pulse-border rounded-2xl shadow-2xl p-6 relative overflow-hidden">
        {/* Top glowing accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-pulse-accent to-transparent" />

        {/* 1. SCREEN: AUTHENTICATION LANDING */}
        {step === 'auth' && (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-xl bg-pulse-surface border border-pulse-accent/30 mx-auto flex items-center justify-center text-pulse-accent shadow-[0_0_20px_rgba(0,240,255,0.25)]">
                <Activity className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Welcome to <span className="text-pulse-accent">PulseChat</span>
              </h1>
              <p className="text-xs text-pulse-muted">
                Real-time messaging, built from the socket up.
              </p>
            </div>

            {/* Google Sign-In Buttons */}
            <div className="space-y-3 pt-2">
              {googleClientId.trim() ? (
                <div className="flex flex-col items-center justify-center w-full gap-2">
                  {/* Google official rendered button container */}
                  <div
                    ref={googleButtonRef}
                    className="flex justify-center w-full min-h-[44px]"
                  />

                  {/* Fallback Direct Google Account Selector Button */}
                  <button
                    type="button"
                    onClick={handleLaunchGooglePopup}
                    className="w-full text-[11px] text-pulse-muted hover:text-pulse-accent transition-colors font-mono py-1 underline underline-offset-4"
                  >
                    Switch / Choose different Google Account
                  </button>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-pulse-surface border border-pulse-border text-center space-y-1.5">
                  <p className="text-xs font-bold text-white">Google Sign-In Setup Required</p>
                  <p className="text-[11px] text-pulse-muted">
                    Set <code className="text-pulse-accent bg-pulse-card px-1 py-0.5 rounded">VITE_GOOGLE_CLIENT_ID</code> in <code className="text-white bg-pulse-card px-1 py-0.5 rounded">frontend/.env</code>.
                  </p>
                </div>
              )}

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-pulse-border"></div>
                <span className="flex-shrink mx-2 text-[10px] text-pulse-muted font-mono uppercase">or</span>
                <div className="flex-grow border-t border-pulse-border"></div>
              </div>

              <button
                type="button"
                onClick={() => setStep('local_user')}
                className="w-full bg-pulse-surface hover:bg-pulse-hover border border-pulse-border text-white text-xs font-mono py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                <User className="w-3.5 h-3.5 text-pulse-accent" />
                <span>Continue with Local Developer Username</span>
              </button>
            </div>

            {/* Error Banners */}
            {(authError || error) && (
              <div className="p-3 rounded-xl bg-pulse-red/10 border border-pulse-red/30 flex items-start gap-2 text-xs text-pulse-red font-mono">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError || error}</span>
              </div>
            )}

            {/* Live TCP Server Health Status */}
            {tcpStatus !== 'connected' && (
              <div className="p-2.5 rounded-xl bg-pulse-yellow/10 border border-pulse-yellow/30 flex items-center gap-2 text-xs text-pulse-yellow font-mono">
                <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                <span>Connecting to C++ POSIX Server (127.0.0.1:9000)...</span>
              </div>
            )}
          </div>
        )}

        {/* 2. SCREEN: DISCORD-STYLE CHOSEN USERNAME ONBOARDING */}
        {step === 'set_username' && googleUser && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-pulse-border pb-3">
              <button
                type="button"
                onClick={() => setStep('auth')}
                className="p-1 rounded text-pulse-muted hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono uppercase text-pulse-accent font-bold">
                Set Chat Handle
              </span>
              <div className="w-4" />
            </div>

            {/* Verified Real Google Identity */}
            <div className="p-3 rounded-xl bg-pulse-surface border border-pulse-border flex items-center gap-3">
              <img
                src={googleUser.avatarUrl}
                alt="Google Avatar"
                className="w-11 h-11 rounded-full border border-pulse-border shadow object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                  <span>{googleUser.name}</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-pulse-green" />
                </div>
                <p className="text-[11px] text-pulse-accent truncate">{googleUser.email}</p>
                <span className="text-[9px] text-pulse-muted uppercase font-mono">Google Verified Account</span>
              </div>
            </div>

            {/* Choose Unique Username */}
            <form onSubmit={handleFinalSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-white font-bold mb-1">
                  Choose Your Unique Chat Handle <span className="text-pulse-accent">*</span>
                </label>
                <p className="text-[11px] text-pulse-muted mb-2">
                  This unique username will represent you on the C++ POSIX socket server (e.g. <span className="text-pulse-accent font-mono font-bold">spaceman</span>).
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-pulse-accent font-mono font-bold text-sm">
                    @
                  </span>
                  <input
                    type="text"
                    value={chosenUsername}
                    onChange={(e) => setChosenUsername(e.target.value)}
                    placeholder="spaceman"
                    autoFocus
                    required
                    maxLength={32}
                    className="w-full bg-pulse-surface border border-pulse-accent/60 focus:border-pulse-accent rounded-xl pl-8 pr-3 py-2.5 text-sm font-mono text-white placeholder-pulse-muted/50 focus:outline-none focus:ring-1 focus:ring-pulse-accent"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-pulse-red/10 border border-pulse-red/30 flex items-start gap-2 text-xs text-pulse-red font-mono">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={!chosenUsername.trim()}
                className="w-full bg-pulse-accent hover:bg-pulse-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-sm py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(0,240,255,0.25)]"
              >
                <span>Enter PulseChat as @{chosenUsername.trim() || 'username'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* 3. SCREEN: LOCAL DEVELOPER LOGIN */}
        {step === 'local_user' && (
          <form onSubmit={handleLocalSubmit} className="space-y-4">
            <div className="flex items-center justify-between border-b border-pulse-border pb-3">
              <button
                type="button"
                onClick={() => setStep('auth')}
                className="p-1 rounded text-pulse-muted hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono uppercase text-pulse-accent font-bold">
                Local Developer Login
              </span>
              <div className="w-4" />
            </div>

            <div>
              <label className="block text-xs font-mono text-white font-bold mb-1">
                Unique Chat Handle <span className="text-pulse-accent">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-pulse-accent font-mono font-bold text-sm">
                  @
                </span>
                <input
                  type="text"
                  value={localUsername}
                  onChange={(e) => setLocalUsername(e.target.value)}
                  placeholder="spaceman"
                  autoFocus
                  required
                  maxLength={32}
                  className="w-full bg-pulse-surface border border-pulse-border focus:border-pulse-accent rounded-xl pl-8 pr-3 py-2.5 text-sm font-mono text-white placeholder-pulse-muted/50 focus:outline-none focus:ring-1 focus:ring-pulse-accent"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-pulse-red/10 border border-pulse-red/30 flex items-start gap-2 text-xs text-pulse-red font-mono">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={!localUsername.trim()}
              className="w-full bg-pulse-accent hover:bg-pulse-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-sm py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(0,240,255,0.25)]"
            >
              <span>Join as @{localUsername.trim() || 'username'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
