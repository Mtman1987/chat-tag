'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { MOSAIC_CONTROLS_COST, MOSAIC_BRUSH_COST, MOSAIC_REVEAL_COST } from '@/lib/mosaic-prices';
type Status = { unlocked: boolean; balance: number; brush: number; direction: string; brushUnlocked: boolean; testingFree: boolean; permanentlyUnlocked: boolean; controlsCost: number; brushCost: number; revealCost: number };
const COLORS = { R:'Red', B:'Blue', G:'Green', Y:'Yellow', P:'Purple', O:'Orange', PK:'Pink', W:'White', K:'Black', C:'Cyan' };
export function MosaicTouchControls({ channel, signedIn, artworkId, run, refresh, renderBoard, testingFree }: {
  testingFree: boolean; channel: string; signedIn: boolean; artworkId?: string; run: (command: string) => Promise<void>; refresh: () => Promise<void>;
  renderBoard: (onCell: (coordinate: string, board: number) => void, disabled: boolean) => ReactNode;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [color, setColor] = useState('Y');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');
  const load = useCallback(async () => {
    if (!signedIn) return;
    try { const response = await fetch(`/api/game-hub/mosaic-controls?channel=${encodeURIComponent(channel)}`, { cache: 'no-store' });
      const data = await response.json(); if (response.ok) setStatus(data); else setReply(data.error || 'Could not load your controls.');
    } catch { setReply('Could not load your points. Try again.'); }
  }, [channel, signedIn]);
  useEffect(() => { setStatus(null); void load(); const timer = window.setInterval(() => void load(), 5000); return () => window.clearInterval(timer); }, [load, artworkId]);
  async function action(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setReply('');
    try {
      const response = await fetch('/api/game-hub/mosaic-controls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, channel }) });
      const data = await response.json(); setReply(data.reply || data.error || 'Control unavailable.');
      if (response.ok) { setStatus(data); await refresh(); }
    } catch { setReply('Connection interrupted. Refresh your balance before trying again.'); }
    finally { setBusy(false); }
  }
  async function command(value: string) { if (busy) return; setBusy(true); try { await run(value); await load(); } finally { setBusy(false); } }
  return <div className="space-y-4">
    <div><h2 className="text-2xl font-black">Click &amp; touch studio</h2><p className="mt-2 text-sm text-slate-300">Choose a color and tap a square to paint. {testingFree ? 'Free testing access is open to everyone this week.' : 'Your one-time unlock follows you across channels and artworks.'}</p></div>
    {testingFree ? <p className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-sm text-emerald-100"><strong>Free testing through October 11.</strong> Click/touch, every brush, and reveal cost zero points. No 5,000-point unlock needed. Normal prices return October 12.</p> : null}
    {!signedIn ? <p className="rounded-2xl bg-violet-300/10 p-5">{testingFree ? 'Sign in with SPMT, then choose a color and tap a square. No purchase needed this week.' : 'Sign in with SPMT to see your Nebula balance and unlock these controls.'}</p> : !status ? <button type="button" onClick={() => void load()} className="rounded-xl border border-white/20 px-4 py-3">Load my points and controls</button> : <>
      <p className="text-sm text-cyan-100">Your balance: <strong>{status.balance.toLocaleString()} Nebula points</strong></p>
      {!status.unlocked ? <div className="space-y-3 rounded-2xl border border-violet-300/30 bg-violet-300/10 p-5"><h3 className="text-lg font-bold">Unlock for {MOSAIC_CONTROLS_COST.toLocaleString()} points</h3><p className="text-sm text-slate-300">A permanent unlock for color selection and click/touch painting. Multi-cell brushes cost another {MOSAIC_BRUSH_COST} points per artwork; reveal costs {MOSAIC_REVEAL_COST} per 15-second preview. Typed commands and single-cell painting stay free.</p><button disabled={busy || status.balance < MOSAIC_CONTROLS_COST} onClick={() => void action({ action:'unlock' })} className="rounded-xl bg-violet-300 px-5 py-3 font-black text-slate-950 disabled:opacity-40">Unlock for 5,000 points</button>{status.balance < MOSAIC_CONTROLS_COST ? <p className="text-sm text-amber-100">Earn {(MOSAIC_CONTROLS_COST - status.balance).toLocaleString()} more Nebula points to unlock.</p> : null}</div> : <>
        <fieldset disabled={busy} className="space-y-3"><legend className="mb-2 font-bold">Paint color</legend><div className="flex flex-wrap gap-2">{Object.entries(COLORS).map(([code,name]) => <button type="button" key={code} aria-pressed={color === code} onClick={() => setColor(code)} className={`rounded-xl border px-3 py-2 text-sm ${color === code ? 'border-cyan-200 bg-cyan-300/20' : 'border-white/20'}`}>{code} · {name}</button>)}</div>
          <p className="text-sm text-slate-300">Brush: {status.brush} · {status.direction}. {status.testingFree ? 'All sizes are free this week.' : status.brushUnlocked ? 'All sizes unlocked for this artwork.' : `Multi-cell sizes: ${MOSAIC_BRUSH_COST} points once per artwork.`}</p>
          <div className="flex flex-wrap gap-2">{[1,2,3,4,5].map(size => <button type="button" key={size} onClick={() => void command(`brush ${size}`)} className="rounded-xl border border-white/20 px-3 py-2 text-sm">{size} cell{size === 1 ? '' : 's'}{size > 1 && !status.brushUnlocked ? ' · 100 pts' : ''}</button>)}</div>
          <div className="flex flex-wrap gap-2">{['left','right','up','down'].map(direction => <button type="button" key={direction} onClick={() => void command(`brush ${direction}`)} className="rounded-xl border border-white/20 px-3 py-2 text-sm">{direction}</button>)}</div>
          <div className="flex flex-wrap gap-2">{[1,2,3,4].map(board => <button type="button" key={board} onClick={() => void command(`show ${board}`)} className="rounded-xl border border-white/20 px-3 py-2 text-sm">Board {board}</button>)}<button type="button" onClick={() => void command('show all')} className="rounded-xl border border-white/20 px-3 py-2 text-sm">Show all · free</button><button type="button" onClick={() => void command('reveal')} className="rounded-xl border border-violet-200/40 px-3 py-2 text-sm">Reveal · {status.testingFree ? 'free' : `${status.revealCost} pts`} / 15s</button></div>
        </fieldset>
        <p className="text-sm text-slate-300">Selected: {COLORS[color as keyof typeof COLORS]}. Choose a board, then click or tap its squares.</p>
        {renderBoard((coordinate, board) => void action({ action:'paint', coordinate, board, color, artworkId }), busy)}
      </>}
    </>}
    {reply ? <p role="status" className="rounded-xl bg-cyan-300/10 p-3 text-sm text-cyan-50">{reply}</p> : null}
  </div>;
}
