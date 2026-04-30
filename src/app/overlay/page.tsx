'use client';

import { useEffect, useState } from 'react';

export default function OverlayLandingPage() {
  const [userId, setUserId] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/user-profile');
        if (res.ok) {
          const data = await res.json();
          if (data.twitch?.id) setUserId(`user_${data.twitch.id}`);
        }
      } catch {}
    };
    fetchProfile();
  }, []);

  const overlayUrl = userId ? `${window.location.origin}/overlay/${userId}` : '';

  return (
    <div style={{ background: '#0a0a1a', color: '#fff', minHeight: '100vh', fontFamily: "'Segoe UI', sans-serif", padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>📺 SPMT Chat Tag — OBS Overlay</h1>
      <p style={{ opacity: 0.6, marginBottom: '32px' }}>Add the game to your stream as a browser source in OBS.</p>

      {overlayUrl ? (
        <div style={{ background: '#1a1a2e', borderRadius: '12px', padding: '24px', marginBottom: '24px', border: '1px solid #333' }}>
          <div style={{ fontSize: '14px', opacity: 0.5, marginBottom: '8px' }}>Your overlay URL:</div>
          <div style={{ background: '#000', borderRadius: '8px', padding: '12px 16px', fontSize: '16px', wordBreak: 'break-all', fontFamily: 'monospace', marginBottom: '12px' }}>
            {overlayUrl}
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(overlayUrl); }}
            style={{ background: '#9146ff', color: '#fff', border: 'none', borderRadius: '6px', padding: '10px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
          >
            Copy URL
          </button>
        </div>
      ) : (
        <div style={{ background: '#1a1a2e', borderRadius: '12px', padding: '24px', marginBottom: '24px', border: '1px solid #333' }}>
          <p>Sign in with Twitch to get your personal overlay URL, or use this format:</p>
          <div style={{ background: '#000', borderRadius: '8px', padding: '12px 16px', fontSize: '16px', fontFamily: 'monospace', marginTop: '12px' }}>
            {typeof window !== 'undefined' ? window.location.origin : ''}/overlay/user_YOUR_TWITCH_ID
          </div>
          <p style={{ opacity: 0.5, marginTop: '8px', fontSize: '13px' }}>Find your user ID by typing "spmt score" in any chat with the bot.</p>
        </div>
      )}

      <h2 style={{ fontSize: '22px', marginBottom: '16px' }}>Setup in OBS</h2>
      <ol style={{ lineHeight: '2', paddingLeft: '20px', opacity: 0.85 }}>
        <li>In OBS, add a <b>Browser Source</b></li>
        <li>Paste your overlay URL</li>
        <li>Set width/height to <b>1920 x 1080</b></li>
        <li>Resize and position it on your scene</li>
        <li>Type <b>spmt mute</b> in your Twitch chat to enable overlay mode (silences bot in chat)</li>
        <li>Type <b>spmt mute</b> again to disable overlay mode and go back to chat</li>
      </ol>

      <h2 style={{ fontSize: '22px', marginTop: '32px', marginBottom: '16px' }}>What it shows</h2>
      <ul style={{ lineHeight: '2', paddingLeft: '20px', opacity: 0.85 }}>
        <li><b>Always visible:</b> Who's IT / FFA status, your stats (score, tags, tagged, passes, wins)</li>
        <li><b>Full-screen alerts:</b> Tag events, double points, FFA announcements — with animations</li>
        <li><b>Periodic:</b> Recent tag history scrolls through on a timer</li>
      </ul>
    </div>
  );
}
