'use client';

import { useEffect, useState } from 'react';

type CoveredSquare = {
  username?: string;
  streamerChannel?: string;
};

type BingoState = {
  phrases: string[];
  covered: Record<string, CoveredSquare>;
};

export function GameHubBingoSurface({ channel }: { channel: string }) {
  const [bingo, setBingo] = useState<BingoState>({ phrases: [], covered: {} });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch('/api/bingo/state', { cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled && body?.bingo) {
          setBingo({
            phrases: Array.isArray(body.bingo.phrases) ? body.bingo.phrases.slice(0, 25) : [],
            covered: body.bingo.covered && typeof body.bingo.covered === 'object' ? body.bingo.covered : {},
          });
        }
      } catch {}
    }
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const cells = Array.from({ length: 25 }, (_, index) => ({
    phrase: bingo.phrases[index] || (index === 12 ? 'FREE SPACE' : 'Waiting for card…'),
    covered: bingo.covered[String(index)] || bingo.covered[index as any],
  }));
  const claimed = cells.filter((cell) => Boolean(cell.covered)).length;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950/70 p-4 text-white shadow-2xl backdrop-blur">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div><div className="text-[9px] uppercase tracking-[.18em] text-cyan-200/60">Games Hub</div><h2 className="font-bold">Bingo</h2></div>
        <span className="rounded-full bg-emerald-300/10 px-2 py-1 text-[9px] font-bold text-emerald-100">ACTIVE · #{channel}</span>
      </header>
      <div className="mb-2 flex items-center justify-between text-[10px] text-white/50"><span>Shared community card</span><span>{claimed}/25 claimed</span></div>
      <div className="grid min-h-0 flex-1 grid-cols-5 gap-1">
        {cells.map((cell, index) => (
          <div key={index} className={`grid min-h-0 place-items-center overflow-hidden rounded-md border p-1 text-center text-[clamp(7px,1.1vw,11px)] leading-tight ${cell.covered ? 'border-cyan-200/30 bg-cyan-300/15 text-cyan-50' : 'border-white/10 bg-white/[0.04] text-slate-300'}`}>
            <span className="line-clamp-3">{cell.covered ? `✓ ${cell.covered.username || cell.phrase}` : cell.phrase}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
