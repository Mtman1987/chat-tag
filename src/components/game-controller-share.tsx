'use client';
import { useEffect, useState } from 'react';
import type { GameHubGame } from '@/lib/game-hub-catalog';

type Connection = { configured: boolean; status?: string; error?: string; webhookName?: string; lastSyncedAt?: string | null };
export function GameControllerShare({ game, channel, canManage }: { game: GameHubGame; channel: string; canManage: boolean }) {
  const [url, setUrl] = useState('');
  const [webhook, setWebhook] = useState('');
  const [connection, setConnection] = useState<Connection>({ configured: false });
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setUrl(channel ? new URL(`/overlay/game-hub/instant.${channel}.${game.id}`, window.location.origin).toString() : ''); }, [channel, game.id]);
  useEffect(() => {
    let cancelled = false;
    setConnection({ configured: false }); setMessage(''); setWebhook('');
    if (!canManage || !channel) return;
    const load = async () => {
      try {
        const response = await fetch(`/api/game-hub/discord?channel=${encodeURIComponent(channel)}&gameId=${encodeURIComponent(game.id)}`, { cache: 'no-store' });
        const data = await response.json();
        if (!cancelled) { if (response.ok) setConnection(data); else setMessage(data.error || 'Could not read the Discord connection.'); }
      } catch { if (!cancelled) setMessage('Could not reach the server. Try again shortly.'); }
    };
    void load(); const timer = window.setInterval(load, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [canManage, channel, game.id]);
  async function update(method: 'POST' | 'DELETE') {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/game-hub/discord', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, gameId: game.id, ...(method === 'POST' ? { webhookUrl: webhook.trim() } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update the connection.');
      setConnection(data); setWebhook('');
      setMessage(method === 'DELETE' ? 'Disconnected. The existing Discord card will stay where it is.' : data.status === 'connected' ? 'Game card sent. It will keep updating here and in Discord.' : data.error || 'Connection saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update the connection.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <div><h2 className="text-2xl font-black">Share {game.name}</h2><p className="mt-2 text-sm text-slate-300">One game, one link. Your channel is already selected: <strong>#{channel || 'choose a channel first'}</strong>.</p></div>
    <section className="space-y-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/[.04] p-5">
      <h3 className="text-lg font-bold">Show on your stream</h3>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-300"><li>Copy the OBS link below.</li><li>In OBS, add a <strong>Browser Source</strong> and paste it into URL.</li><li>Set width to <strong>1920</strong> and height to <strong>1080</strong>. Start the game from the Command tab.</li></ol>
      <label className="block text-xs font-bold text-cyan-100" htmlFor="game-overlay-link">OBS browser source URL</label>
      <input id="game-overlay-link" readOnly value={url} onFocus={event => event.target.select()} className="w-full rounded-xl border border-white/15 bg-black/40 p-3 text-xs text-slate-200" />
      <div className="flex flex-wrap gap-2"><button disabled={!url} onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setMessage('Select the URL above and copy it.'); } }} className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-40">{copied ? 'Copied!' : 'Copy OBS link'}</button>{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/20 px-4 py-2 text-sm text-white">Open preview</a> : null}</div>
      <p className="text-xs text-slate-400">This link always follows {game.name} in #{channel || 'your channel'}. No overlay profile setup is needed.</p>
    </section>
    <section className="space-y-3 rounded-2xl border border-violet-300/20 bg-violet-300/[.04] p-5">
      <h3 className="text-lg font-bold">Send this game to Discord</h3>
      <p className="text-sm text-slate-300">Paste a webhook from your Discord text channel. We’ll send one game card and update its progress and scores about every 30 seconds, even when this controller is closed. Players use the card’s link to play in Twitch chat.</p>
      <details className="text-sm text-slate-400"><summary className="cursor-pointer text-violet-100">Where do I get a webhook?</summary><p className="mt-2">In Discord, edit the destination text channel → Integrations → Webhooks → New Webhook → Copy Webhook URL. You need permission to manage webhooks. Each game can use a different channel.</p></details>
      {canManage ? <form onSubmit={event => { event.preventDefault(); void update('POST'); }} className="space-y-3">
        <label htmlFor="game-discord-webhook" className="block text-xs font-bold text-violet-100">{connection.configured ? 'Replace or reconnect webhook' : 'Discord webhook URL'}</label>
        <input id="game-discord-webhook" type="password" autoComplete="off" value={webhook} onChange={event => setWebhook(event.target.value)} placeholder="https://discord.com/api/webhooks/…" className="w-full rounded-xl border border-white/15 bg-black/40 p-3 text-sm text-white" />
        <p className="text-xs text-slate-400">Your saved webhook stays private and is never displayed here.</p>
        <div className="flex flex-wrap gap-2"><button disabled={busy || !webhook.trim() || !channel} className="rounded-full bg-violet-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-40">{busy ? 'Working…' : 'Save & send game'}</button>{connection.configured ? <button type="button" disabled={busy} onClick={() => void update('DELETE')} className="rounded-full border border-white/20 px-4 py-2 text-sm text-slate-200 disabled:opacity-40">Disconnect</button> : null}</div>
      </form> : <p className="rounded-xl bg-black/30 p-3 text-sm text-slate-300">Sign in as the channel owner to connect Discord.</p>}
      {connection.configured ? <div className="text-sm text-violet-100">{connection.webhookName} · {connection.status}{connection.lastSyncedAt ? <span className="block text-xs text-slate-400">Last updated {new Date(connection.lastSyncedAt).toLocaleString()}</span> : null}{connection.error ? <p className="mt-2 text-amber-200">{connection.error}</p> : null}</div> : null}
    </section>
    {message ? <p role="status" className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3 text-sm text-cyan-50">{message}</p> : null}
  </div>;
}
