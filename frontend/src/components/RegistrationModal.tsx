import React, { useState, useEffect, useRef } from 'react';
import { Activity, ArrowRight, AlertCircle, User, Shield, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import { UserProfile } from '../types';

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
  const googleClientId =
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    '937690153740-nrq4auc9nr66alrps1n0nhs3rckr8uip.apps.googleusercontent.com';

  const [step, setStep] = useState<'auth' | 'set_username' | 'local_user'>('auth');
  const [googleUser, setGoogleUser] = useState<RealGoogleUser | null>(null);
  const [chosenUsername, setChosenUsername] = useState('');
  const [localUsername, setLocalUsername] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Check if page was returned from a Google OAuth redirect with #access_token=...
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.replace('#', '?'));
      const accessToken = params.get('access_token');
      if (accessToken) {
        setIsLoading(true);
        window.history.replaceState(null, '', window.location.pathname);
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.email) {
              setGoogleUser({
                email: data.email,
                name: data.name || data.email.split('@')[0],
                avatarUrl: data.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${data.email}`
              });
              const suggested = data.email
                .split('@')[0]
                .replace(/[^a-zA-Z0-9_-]/g, '_')
                .toLowerCase();
              setChosenUsername(suggested);
              setStep('set_username');
            }
          })
          .catch((err) => {
            console.error('Userinfo error:', err);
            setAuthError('Failed to fetch user profile from Google.');
          })
          .finally(() => setIsLoading(false));
      }
    }
  }, []);

  // Robust Direct Google OAuth Flow
  const handleGoogleOAuthLogin = () => {
    setAuthError(null);
    setIsLoading(true);

    const redirectUri = window.location.origin;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
      googleClientId.trim()
    )}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=email%20profile%20openid&prompt=select_account`;

    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      'GoogleSignIn',
      `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no`
    );

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      window.location.href = authUrl;
      return;
    }

    const pollTimer = window.setInterval(() => {
      try {
        if (!popup || popup.closed) {
          window.clearInterval(pollTimer);
          setIsLoading(false);
          return;
        }

        const popupUrl = popup.location.href;
        if (popupUrl && popupUrl.includes(redirectUri) && popupUrl.includes('access_token=')) {
          window.clearInterval(pollTimer);
          const hash = popup.location.hash;
          popup.close();

          const params = new URLSearchParams(hash.replace('#', '?'));
          const accessToken = params.get('access_token');
          if (accessToken) {
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` }
            })
              .then((res) => res.json())
              .then((data) => {
                if (data.email) {
                  setGoogleUser({
                    email: data.email,
                    name: data.name || data.email.split('@')[0],
                    avatarUrl: data.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${data.email}`
                  });
                  const suggested = data.email
                    .split('@')[0]
                    .replace(/[^a-zA-Z0-9_-]/g, '_')
                    .toLowerCase();
                  setChosenUsername(suggested);
                  setStep('set_username');
                }
              })
              .catch(() => {
                setAuthError('Failed to fetch user profile from Google.');
              })
              .finally(() => setIsLoading(false));
          }
        }
      } catch (e) {
        // Cross-origin access error is normal while popup is on accounts.google.com
      }
    }, 500);
  };

  // Submit Final Profile
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
        {/* Glowing top line */}
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

            {/* Direct Google Continue Button */}
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={handleGoogleOAuthLogin}
                disabled={isLoading}
                className="w-full bg-white hover:bg-gray-100 active:scale-[0.99] text-gray-900 font-semibold text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-3 transition-all shadow-md cursor-pointer"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-700" />
                ) : (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>{isLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
              </button>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-pulse-border"></div>
                <span className="flex-shrink mx-2 text-[10px] text-pulse-muted font-mono uppercase">or</span>
                <div className="flex-grow border-t border-pulse-border"></div>
              </div>

              <button
                type="button"
                onClick={() => setStep('local_user')}
                className="w-full bg-pulse-surface hover:bg-pulse-hover border border-pulse-border text-white text-xs font-mono py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
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
                className="w-full bg-pulse-accent hover:bg-pulse-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-sm py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(0,240,255,0.25)] cursor-pointer"
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
              className="w-full bg-pulse-accent hover:bg-pulse-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-sm py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(0,240,255,0.25)] cursor-pointer"
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
