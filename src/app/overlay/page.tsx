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

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const overlayUrl = userId ? `${origin}/overlay/${userId}` : '';
  const previewUrl = `${origin}/overlay/preview`;

  const triggerPreview = (kind: string) => {
    const frame = document.getElementById('overlay-preview-frame') as HTMLIFrameElement | null;
    frame?.contentWindow?.postMessage({ type: 'overlay-preview-trigger', kind }, window.location.origin);
  };

  return (
    <main className="cosmic-page max-w-5xl">
      <section className="cosmic-hero">
        <div className="cosmic-card space-y-4">
          <div className="cosmic-status">Production Layout</div>
          <h1 className="cosmic-title">Overlay</h1>
          <p className="cosmic-subtitle">
            The overlay studio is now the model for the Chat Tag utility surface. Use it to pull your OBS browser URL, test live alert states, and keep overlay mode tied to the current bot workflow.
          </p>
          <div className="cosmic-note">
            This page still uses your signed-in profile, the current overlay route format, and the existing preview message triggers. The behavior did not get flattened into a mock.
          </div>
        </div>

        <div className="cosmic-panel">
          <h2 className="mb-4 font-headline text-2xl text-white">Studio Preview</h2>
          <div className="mock-window">
            <div className="mock-head">
              <span className="mock-dot mock-dot-red" />
              <span className="mock-dot mock-dot-amber" />
              <span className="mock-dot mock-dot-green" />
            </div>
            <div className="mock-body">
              <div className="mock-row"><span>App</span><span>Chat-Tag</span></div>
              <div className="mock-row"><span>Page</span><span>overlay</span></div>
              <div className="mock-row"><span>Mode</span><span>OBS studio</span></div>
              <div className="mock-row"><span>Status</span><span>{userId ? 'Bound to account' : 'Manual mode'}</span></div>
            </div>
          </div>
        </div>
      </section>

      {overlayUrl ? (
        <section className="cosmic-card space-y-3">
          <div className="text-sm text-slate-400">Your overlay URL</div>
          <div className="rounded-xl bg-black/55 px-4 py-3 font-mono text-sm text-cyan-100 break-all">
            {overlayUrl}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(overlayUrl);
            }}
            className="w-fit rounded-full bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--accent)))] px-5 py-2 text-sm font-bold text-slate-950"
          >
            Copy URL
          </button>
        </section>
      ) : (
        <section className="cosmic-card space-y-3">
          <p>Sign in with Twitch to get your personal overlay URL, or use this format:</p>
          <div className="rounded-xl bg-black/55 px-4 py-3 font-mono text-sm text-cyan-100">
            {origin}/overlay/user_YOUR_TWITCH_ID
          </div>
          <p className="text-sm text-slate-400">Find your user ID by typing "spmt score" in any chat with the bot.</p>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="cosmic-card">
          <h2 className="mb-4 font-headline text-2xl text-white">Setup in OBS</h2>
          <ol className="list-decimal space-y-3 pl-5 text-sm leading-7 text-slate-300">
            <li>In OBS, add a <b>Browser Source</b>.</li>
            <li>Paste your overlay URL.</li>
            <li>Set width and height to <b>1920 x 1080</b>.</li>
            <li>Resize and position it on your scene.</li>
            <li>Type <b>spmt mute</b> in Twitch chat to enable overlay mode.</li>
            <li>Type <b>spmt mute</b> again to return bot messages to chat.</li>
          </ol>
        </div>

        <div className="cosmic-card">
          <h2 className="mb-4 font-headline text-2xl text-white">What it shows</h2>
          <ul className="list-disc space-y-3 pl-5 text-sm leading-7 text-slate-300">
            <li><b>Always visible:</b> who&apos;s IT or FFA status, your stats, passes, and wins.</li>
            <li><b>Full-screen alerts:</b> tag events, double points, and free-for-all announcements.</li>
            <li><b>Periodic:</b> recent tag history rotates through on a timer.</li>
          </ul>
        </div>
      </section>

      <section className="cosmic-card">
        <h2 className="mb-2 font-headline text-2xl text-white">Preview Tester</h2>
        <p className="mb-4 text-sm text-slate-300">Use the mock preview below to test overlay behavior without waiting for live game events.</p>

        <div className="mb-4 flex flex-wrap gap-2">
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
              className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100"
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setPreviewKey((value) => value + 1)}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-100"
          >
            Reset Preview
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
          <div className="mb-2 text-xs uppercase tracking-[0.24em] text-slate-500">Preview source URL</div>
          <div className="mb-3 rounded-xl bg-black/55 px-4 py-3 font-mono text-sm text-cyan-100 break-all">
            {previewUrl}
          </div>
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[linear-gradient(180deg,#101827,#060b14)]">
            <iframe
              key={previewKey}
              id="overlay-preview-frame"
              src={previewUrl}
              title="Overlay Preview"
              className="h-full w-full border-0 bg-transparent"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
