'use client';

import { useEffect, useState } from 'react';

export default function OverlayLandingPage() {
  const [userId, setUserId] = useState('');
  const [previewKey, setPreviewKey] = useState(0);

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
  const previewUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/overlay/preview`;

  const triggerPreview = (kind: string) => {
    const frame = document.getElementById('overlay-preview-frame') as HTMLIFrameElement | null;
    frame?.contentWindow?.postMessage({ type: 'overlay-preview-trigger', kind }, window.location.origin);
  };

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

      <h2 style={{ fontSize: '22px', marginTop: '32px', marginBottom: '16px' }}>Preview Tester</h2>
      <p style={{ opacity: 0.72, marginBottom: '16px' }}>Use the mock preview below to see how the overlay reacts on stream without needing live game data.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        {[
          ['message', 'Bot Reply'],
          ['tag', 'Tag'],
          ['pass', 'Pass Used'],
          ['grantpass', 'Pass Granted'],
          ['rank', 'Leaderboard'],
          ['score', 'Score'],
          ['live', 'Live'],
          ['history', 'History'],
          ['newit', 'New IT'],
          ['ffa', 'FFA'],
        ].map(([kind, label]) => (
          <button
            key={kind}
            onClick={() => triggerPreview(kind)}
            style={{ background: '#1f2a44', color: '#fff', border: '1px solid #35507a', borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', fontSize: '14px', fontWeight: 700 }}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setPreviewKey((v) => v + 1)}
          style={{ background: '#111827', color: '#fff', border: '1px solid #374151', borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', fontSize: '14px', fontWeight: 700 }}
        >
          Reset Preview
        </button>
      </div>

      <div style={{ background: '#060b14', borderRadius: '12px', padding: '16px', border: '1px solid #243246' }}>
        <div style={{ fontSize: '13px', opacity: 0.6, marginBottom: '8px' }}>Preview source URL</div>
        <div style={{ background: '#000', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', fontFamily: 'monospace', marginBottom: '12px', wordBreak: 'break-all' }}>
          {previewUrl}
        </div>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: 'linear-gradient(180deg, #101827, #060b14)', borderRadius: '10px', overflow: 'hidden' }}>
          <iframe
            key={previewKey}
            id="overlay-preview-frame"
            src={previewUrl}
            title="Overlay Preview"
            style={{ width: '100%', height: '100%', border: 'none', background: 'transparent' }}
          />
        </div>
      </div>
    </div>
  );
}
