'use client';

import { useEffect, useState } from 'react';

type BingoCell = { coordinate: string; status: 'open' | 'pending' | 'chat' | 'stella' | 'replacement'; phrase?: string; claimSeconds: number };
type BingoState = { cells: BingoCell[]; chatSquares: number; stellaSquares: number; participantCount: number; complete: boolean; winningLine: string[] };
const EMPTY: BingoState = { cells: [], chatSquares: 0, stellaSquares: 0, participantCount: 0, complete: false, winningLine: [] };

export function GameHubBingoSurface({ channel, broadcastOnly = false }: { channel: string; broadcastOnly?: boolean }) {
  const [bingo, setBingo] = useState<BingoState>(EMPTY);

  useEffect(() => {
    if (!channel) return;
    let cancelled = false;
    async function load() {
      const query = new URLSearchParams({ channel });
      if (!broadcastOnly) query.set('view', 'player');
      try {
        const response = await fetch(`/api/game-hub/shared-bingo?${query.toString()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) setBingo({
          cells: Array.isArray(body.cells) ? body.cells.slice(0, 25) : [],
          chatSquares: Number(body.chatSquares || 0), stellaSquares: Number(body.stellaSquares || 0),
          participantCount: Number(body.participantCount || 0), complete: Boolean(body.complete),
          winningLine: Array.isArray(body.winningLine) ? body.winningLine : [],
        });
      } catch {}
    }
    void load();
    const timer = window.setInterval(() => void load(), 1_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [broadcastOnly, channel]);

  const cells = Array.from({ length: 25 }, (_, index) => bingo.cells[index] || {
    coordinate: `${String.fromCharCode(65 + (index % 5))}${Math.floor(index / 5) + 1}`, status: 'open' as const, claimSeconds: 0,
  });

  return <section className={`flex h-full min-h-0 flex-col overflow-hidden text-white ${broadcastOnly ? 'p-1' : 'p-4'}`}>
    {!broadcastOnly && <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-white/60">
      <span>Shared card · chat {bingo.chatSquares} · Stella {bingo.stellaSquares}</span>
      <span>{bingo.participantCount} participant{bingo.participantCount === 1 ? '' : 's'} · claim with <b className="text-cyan-100">spmt bingo B4</b></span>
    </div>}
    <div aria-label="Bingo grid" className="grid min-h-0 flex-1 grid-cols-5 grid-rows-5 gap-1">
      {cells.map((cell) => {
        const won = bingo.winningLine.includes(cell.coordinate);
        const style = cell.status === 'chat' ? 'border-emerald-200/70 bg-emerald-400/25 text-emerald-50'
          : cell.status === 'stella' ? 'border-violet-200/60 bg-violet-500/25 text-violet-50'
            : cell.status === 'pending' ? 'animate-pulse border-amber-100 bg-amber-400/30 text-amber-50'
              : cell.status === 'replacement' ? 'border-cyan-200/50 bg-cyan-400/15 text-cyan-50'
                : 'border-white/15 bg-white/[0.04] text-slate-200';
        return <div key={cell.coordinate} className={`grid min-h-0 place-items-center overflow-hidden rounded-md border p-1 text-center ${style} ${won ? 'ring-2 ring-yellow-200' : ''}`}>
          {broadcastOnly ? <div>
            <div className="text-[clamp(10px,2.1vw,18px)] font-black tracking-wide">{cell.coordinate}</div>
            <div className="text-[clamp(7px,1vw,10px)] font-bold uppercase opacity-80">{cell.status === 'pending' ? `claim ${cell.claimSeconds}` : cell.status === 'chat' ? 'chat ✓' : cell.status === 'stella' ? 'Stella ◆' : cell.status === 'replacement' ? 'new' : ''}</div>
          </div> : <div className="min-w-0">
            <div className="text-[10px] font-black text-cyan-100">{cell.coordinate}{cell.status === 'pending' ? ` · CLAIM ${cell.claimSeconds}` : ''}</div>
            <div className="mt-1 line-clamp-3 text-[clamp(8px,1.2vw,12px)] leading-tight">{cell.phrase || 'Sign in to reveal phrase'}</div>
          </div>}
        </div>;
      })}
    </div>
    {!broadcastOnly && <p className="mt-3 shrink-0 text-xs text-white/50">Change phrase: <b className="text-cyan-100">spmt bingo B4 new phrase</b> · buy back Stella: <b className="text-cyan-100">spmt bingo flip B4</b> · center free space: <b className="text-cyan-100">spmt bingo free</b></p>}
  </section>;
}
