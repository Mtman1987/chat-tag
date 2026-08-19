'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/contexts/session-context';

type Props = {
  gameId: string;
  gameName: string;
};

export function GameHubControlPanel({ gameId, gameName }: Props) {
  const { user, isUserLoading } = useSession();
  const [active, setActive] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const channel = String(user?.twitchUsername || '').trim().toLowerCase();

  useEffect(() => {
    if (!channel) {
      setActive(null);
      return;
    }
    let cancelled = false;
    setActive(null);
    void fetch(`/api/game-hub/channel?channel=${encodeURIComponent(channel)}`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => {
        if (!cancelled && Array.isArray(body?.gameIds)) setActive(body.gameIds.includes(gameId));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [channel, gameId]);

  async function setRunning(running: boolean) {
    if (!channel || busy || active === null) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/game-hub/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, gameId, action: running ? 'start' : 'stop' }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Request returned ${response.status}`);
      setActive(Array.isArray(body.gameIds) ? body.gameIds.includes(gameId) : running);
      setMessage(`${gameName} ${running ? 'started' : 'stopped'} for #${channel}.`);
    } catch (error: any) {
      setMessage(error?.message || 'Unable to update game state.');
    } finally {
      setBusy(false);
    }
  }

  if (isUserLoading) return <div className="text-xs text-slate-500">Loading streamer controls…</div>;
  if (!user || !channel) {
    return <div className="text-xs text-slate-500">Sign in with SPMT to control this game for your channel.</div>;
  }

  const scopeLabel = active === null ? 'CHECKING' : active ? 'ACTIVE' : 'STOPPED';

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-headline text-lg text-white">Streamer controls</h2>
          <p className="mt-1 text-xs text-slate-500">Scope: #{channel} · {scopeLabel}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${active ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200' : 'border-white/10 bg-white/5 text-slate-400'}`}>
          {scopeLabel}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy || active === null || active === true} onClick={() => void setRunning(true)} className="rounded-full bg-emerald-300 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-40">Start</button>
        <button type="button" disabled={busy || active === null || active === false} onClick={() => void setRunning(false)} className="rounded-full border border-rose-300/20 bg-rose-300/10 px-4 py-2 text-xs font-bold text-rose-100 disabled:opacity-40">Stop</button>
      </div>
      {message && <p className="mt-3 text-xs text-cyan-100">{message}</p>}
    </div>
  );
}
