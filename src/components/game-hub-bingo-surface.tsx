'use client';

import { useEffect, useState } from 'react';

type BingoState = {
  phrases: string[];
  aggregate: {
    players: number;
    totalClaims: number;
    completedCards: number;
  };
};

export function GameHubBingoSurface({ channel }: { channel: string }) {
  const [bingo, setBingo] = useState<BingoState>({
    phrases: [],
    aggregate: { players: 0, totalClaims: 0, completedCards: 0 },
  });

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
            aggregate: {
              players: Number(body.bingo.aggregate?.players || 0),
              totalClaims: Number(body.bingo.aggregate?.totalClaims || 0),
              completedCards: Number(body.bingo.aggregate?.completedCards || 0),
            },
          });
        }
      } catch {}
    }
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const cells = Array.from({ length: 25 }, (_, index) => ({
    phrase: bingo.phrases[index] || (index === 12 ? 'PERSONAL CENTER' : 'Waiting for card…'),
    personal: index === 12,
  }));

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950/70 p-4 text-white shadow-2xl backdrop-blur">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div><div className="text-[9px] uppercase tracking-[.18em] text-cyan-200/60">Games Hub</div><h2 className="font-bold">Bingo</h2></div>
        <span className="rounded-full bg-emerald-300/10 px-2 py-1 text-[9px] font-bold text-emerald-100">ACTIVE · #{channel}</span>
      </header>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/50">
        <span>24 shared phrases · personal center</span>
        <span>{bingo.aggregate.players} players · {bingo.aggregate.totalClaims} claims · {bingo.aggregate.completedCards} bingos</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-5 gap-1">
        {cells.map((cell, index) => (
          <div key={index} className={`grid min-h-0 place-items-center overflow-hidden rounded-md border p-1 text-center text-[clamp(7px,1.1vw,11px)] leading-tight ${cell.personal ? 'border-violet-200/30 bg-violet-300/15 text-violet-50' : 'border-white/10 bg-white/[0.04] text-slate-300'}`}>
            <span className="line-clamp-3">{cell.personal ? '★ PERSONAL CENTER' : cell.phrase}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
