'use client';
import { useEffect, useRef, useState } from 'react';
import type { GameHubGame } from '@/lib/game-hub-catalog';
import { canonicalPlayerCommands } from '@/lib/game-hub-commands';
export function StellaControllerGuide({ game, channel, canManage, onGuide, onShare }: { game: GameHubGame; channel: string; canManage: boolean; onGuide: () => void; onShare: () => void }) {
  const [audio, setAudio] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const player = useRef<HTMLAudioElement>(null);
  useEffect(() => { setAudio(''); setError(''); }, [game.id, channel]);
  useEffect(() => { if (audio) void player.current?.play().catch(() => {}); }, [audio]);
  const command = canonicalPlayerCommands(game)[0];
  async function listen() {
    if (audio) { void player.current?.play().catch(() => {}); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/game-hub/stella-guide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, gameId: game.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Voice is unavailable.');
      setAudio(data.audioDataUri);
    } catch (error) { setError(error instanceof Error ? error.message : 'Voice is unavailable. Read Stella’s help below.'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Stella game guide" className="rounded-3xl border border-violet-300/30 bg-violet-300/[.08] p-4">
    <div className="flex items-center gap-3"><span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-violet-300 text-2xl text-slate-950">✦</span><div><h2 className="font-black text-violet-100">Stella</h2><p className="text-xs text-violet-200">Your game guide</p></div></div>
    <p className="mt-3 text-sm leading-6 text-slate-200">{game.id === 'pixelbattle' ? 'Find the letter across the top and the number down the left. Add the color code shown in the square. For example, spmt D12Y paints D12 yellow.' : game.howToPlay}</p>
    {command ? <p className="mt-3 rounded-xl bg-black/30 p-3 text-xs text-cyan-100">Try in Twitch chat: <code className="break-words font-bold">{command.trigger}</code></p> : null}
    <div className="mt-3 flex flex-wrap gap-2"><button onClick={onGuide} className="rounded-full border border-white/15 px-3 py-2 text-xs font-bold">How to play</button><button onClick={onShare} className="rounded-full border border-violet-300/25 bg-violet-300/10 px-3 py-2 text-xs font-bold">Help me share</button>{canManage ? <button disabled={busy} onClick={() => void listen()} className="rounded-full border border-white/15 px-3 py-2 text-xs font-bold disabled:opacity-40">{busy ? 'Stella is getting ready…' : 'Listen to Stella'}</button> : null}</div>
    {audio ? <audio ref={player} controls src={audio} className="mt-3 w-full" aria-label="Stella’s game instructions" /> : null}
    {error ? <p role="status" className="mt-3 text-xs text-amber-200">{error}</p> : null}
  </section>;
}
