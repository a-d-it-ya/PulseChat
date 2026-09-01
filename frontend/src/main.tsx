import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// ⚡ Instant OAuth Popup Closer & Inter-Window Handoff
if (window.location.hash && window.location.hash.includes('access_token=')) {
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  if (accessToken) {
    try {
      const channel = new BroadcastChannel('pulsechat_oauth_channel');
      channel.postMessage({ type: 'PULSECHAT_GOOGLE_AUTH_SUCCESS', accessToken });
    } catch {}

    try {
      localStorage.setItem('pulsechat_oauth_handoff', JSON.stringify({ accessToken, time: Date.now() }));
    } catch {}

    if (window.opener && window.opener !== window) {
      try {
        window.opener.postMessage({ type: 'PULSECHAT_GOOGLE_AUTH_SUCCESS', accessToken }, '*');
      } catch {}
      window.close();
    }
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
