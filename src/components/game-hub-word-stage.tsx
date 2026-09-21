'use client';

import { useEffect, useState } from 'react';

type WordChainSnapshot = {
  roundNumber: number;
  theme: string;
  currentWord: string;
  requiredLetter: string;
  chainLength: number;
  secondsLeft: number;
  vote?: { word: string; closesAt: number } | null;
};

type PhraseGuessSnapshot = {
  maskedPhrase: string;
  secondsLeft: number;
  hintsUsed: number;
  solved: boolean;
  submitterDisplayName?: string;
};

function clock(seconds: number) {
  const safe = Math.max(0, Math.floor(Number(seconds || 0)));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function GameHubWordStage({ gameId, channel }: { gameId: 'wordchain' | 'phraseguess'; channel: string }) {
  const [snapshot, setSnapshot] = useState<WordChainSnapshot | PhraseGuessSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const query = new URLSearchParams({ channel, game: gameId });
        const response = await fetch(`/api/game-hub/word-stage?${query}`, { cache: 'no-store' });
        const body = await response.json();
        if (!cancelled && response.ok) setSnapshot(body.snapshot || null);
      } catch {}
    };
    void sync();
    const timer = window.setInterval(sync, 1_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [channel, gameId]);

  if (!snapshot) {
    return <div className="flex h-full w-full items-center justify-center text-[clamp(18px,3vw,42px)] font-black uppercase tracking-[.2em] text-cyan-100/60">Loading game…</div>;
  }

  if (gameId === 'wordchain') {
    const chain = snapshot as WordChainSnapshot;
    const head = chain.currentWord.slice(0, -1);
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-[4%] text-white">
        <div className="absolute left-[3%] top-[4%] rounded-full border border-cyan-300/35 bg-slate-950/70 px-[2.4%] py-[1.1%] text-[clamp(12px,1.7vw,25px)] font-black uppercase tracking-[.12em] text-cyan-100">
          {chain.theme} · Round {chain.roundNumber}/5
        </div>
        <div className="absolute right-[3%] top-[4%] rounded-full border border-violet-300/35 bg-slate-950/70 px-[2.4%] py-[1.1%] text-[clamp(12px,1.7vw,25px)] font-black tabular-nums text-violet-100">
          {clock(chain.secondsLeft)}
        </div>
        <div className="max-w-full break-all text-center text-[clamp(56px,12vw,180px)] font-black uppercase leading-none tracking-[.08em] drop-shadow-[0_0_26px_rgba(34,211,238,.55)]">
          {head}<span className="text-fuchsia-300">{chain.requiredLetter}</span>
        </div>
        <div className="mt-[5%] text-center text-[clamp(15px,2vw,30px)] font-bold uppercase tracking-[.16em] text-cyan-100/80">
          Next word starts with <span className="text-fuchsia-300">{chain.requiredLetter}</span> · {chain.chainLength} words
        </div>
        {chain.vote && <div className="absolute bottom-[4%] rounded-full border border-amber-300/40 bg-slate-950/80 px-[3%] py-[1.2%] text-[clamp(13px,1.7vw,24px)] font-bold text-amber-100">Vote YES or NO: does “{chain.vote.word}” fit?</div>}
      </div>
    );
  }

  const phrase = snapshot as PhraseGuessSnapshot;
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-[6%] text-white">
      <div className="absolute left-[3%] top-[4%] rounded-full border border-cyan-300/35 bg-slate-950/70 px-[2.4%] py-[1.1%] text-[clamp(12px,1.7vw,25px)] font-black uppercase tracking-[.12em] text-cyan-100">
        Phrase Guess · {phrase.hintsUsed}/3 hints
      </div>
      <div className="absolute right-[3%] top-[4%] rounded-full border border-violet-300/35 bg-slate-950/70 px-[2.4%] py-[1.1%] text-[clamp(12px,1.7vw,25px)] font-black tabular-nums text-violet-100">
        {clock(phrase.secondsLeft)}
      </div>
      <div className="max-w-full whitespace-pre-wrap text-center text-[clamp(40px,7.5vw,120px)] font-black leading-[1.18] tracking-[.1em] drop-shadow-[0_0_26px_rgba(34,211,238,.55)]">
        {phrase.maskedPhrase}
      </div>
      <div className="absolute bottom-[4%] text-[clamp(13px,1.6vw,23px)] font-bold uppercase tracking-[.14em] text-cyan-100/70">
        {phrase.solved ? 'Solved!' : 'Guess normally in chat'}{phrase.submitterDisplayName ? ` · Submitted by ${phrase.submitterDisplayName}` : ''}
      </div>
    </div>
  );
}
