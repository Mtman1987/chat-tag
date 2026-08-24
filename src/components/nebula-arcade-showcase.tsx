'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Pause, Play } from 'lucide-react';
import { GAME_HUB_CATALOG } from '@/lib/game-hub-registry';
import { NebulaGameFrame } from '@/components/nebula-game-frame';

const ROTATION_MS = 12_000;

export function NebulaArcadeShowcase() {
  const games = useMemo(() => GAME_HUB_CATALOG.filter((game) => Boolean(game.sourcePrototype)), []);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const active = games[index % Math.max(1, games.length)];

  useEffect(() => {
    if (!playing || games.length < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % games.length), ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [games.length, playing]);

  if (!active) return null;
  const move = (direction: number) => setIndex((current) => (current + direction + games.length) % games.length);

  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-cyan-300/20 bg-slate-950/75 shadow-[0_28px_100px_rgba(3,8,24,.55)]" aria-label="Nebula Arcade game rotation">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-200/65">Live game gallery · {index + 1}/{games.length}</div>
          <h2 className="truncate font-headline text-lg font-bold text-white">{active.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => move(-1)} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white" aria-label="Previous game"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => setPlaying((current) => !current)} className="grid h-9 w-9 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-cyan-100" aria-label={playing ? 'Pause rotation' : 'Resume rotation'}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
          <button type="button" onClick={() => move(1)} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white" aria-label="Next game"><ChevronRight className="h-4 w-4" /></button>
          <a href={`/nebula-arcade/games/${active.sourcePrototype?.split('/').pop()}?embedded=1&demo=1`} target="_blank" rel="noopener noreferrer" className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white" aria-label={`Open ${active.name}`}><ExternalLink className="h-4 w-4" /></a>
        </div>
      </div>
      <div className="aspect-video min-h-[320px] bg-black/35">
        <NebulaGameFrame key={active.id} game={active} demo title={`${active.name} demo`} />
      </div>
      <div className="flex gap-1 overflow-x-auto border-t border-white/10 p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {games.map((game, gameIndex) => (
          <button key={game.id} type="button" onClick={() => setIndex(gameIndex)} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold transition ${gameIndex === index ? 'bg-cyan-300 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>{game.shortName}</button>
        ))}
      </div>
    </section>
  );
}
