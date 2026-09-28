'use client';

import { useEffect, useState } from 'react';

type WordChainSnapshot = {
  roundNumber: number;
  theme: string;
  currentWord: string;
  requiredLetter: string;
  chainLength: number;
  secondsLeft: number;
  phase: 'play' | 'review' | 'tally';
  reviewWords: Array<{ number: number; word: string; displayName: string; points: number; up: number; down: number; accepted?: boolean }>;
  reviewLeaders: Array<{ displayName: string; points: number }>;
  lastTally?: { roundSlot: number; accepted: number; rejected: number } | null;
};

type PhraseGuessSnapshot = {
  maskedPhrase: string;
  secondsLeft: number;
  hintsUsed: number;
  solved: boolean;
  submitterDisplayName?: string;
};

type StreamBattleSnapshot = {
  battleId: string;
  gameId: 'wordchain' | 'phraseguess';
  channels: string[];
  scores: Record<string, number>;
  active: boolean;
  winnerChannel?: string;
  winnerDisplayName?: string;
};

function clock(seconds: number) {
  const safe = Math.max(0, Math.floor(Number(seconds || 0)));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function GameHubWordStage({ gameId, channel }: { gameId: 'wordchain' | 'phraseguess'; channel: string }) {
  const [snapshot, setSnapshot] = useState<WordChainSnapshot | PhraseGuessSnapshot | null>(null);
  const [battle, setBattle] = useState<StreamBattleSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const query = new URLSearchParams({ channel, game: gameId });
        const response = await fetch(`/api/game-hub/word-stage?${query}`, { cache: 'no-store' });
        const body = await response.json();
        if (!cancelled && response.ok) {
          setSnapshot(body.snapshot || null);
          setBattle(body.battle || null);
        }
      } catch {}
    };
    void sync();
    const timer = window.setInterval(sync, 1_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [channel, gameId]);

  if (!snapshot) {
    return <div className="flex h-full w-full items-center justify-center text-[clamp(18px,3vw,42px)] font-black uppercase tracking-[.2em] text-cyan-100/60">Loading game…</div>;
  }

  const battleBar = battle?.active && battle.channels.length > 1 ? (
    <div className="absolute bottom-[3%] left-[3%] right-[3%] flex flex-wrap items-center justify-center gap-x-[3%] gap-y-1 rounded-full border border-white/15 bg-slate-950/80 px-[2.5%] py-[1%] text-[clamp(9px,1.3vw,18px)] font-black uppercase tracking-[.08em] text-white/80">
      {battle.channels.map((entry) => <span key={entry} className={entry === battle.winnerChannel ? 'text-emerald-200' : ''}>@{entry} {Number(battle.scores?.[entry] || 0)}</span>)}
      {battle.winnerDisplayName ? <span className="text-emerald-200">Won by {battle.winnerDisplayName}</span> : null}
    </div>
  ) : null;

  if (gameId === 'wordchain') {
    const chain = snapshot as WordChainSnapshot;
    const head = chain.currentWord.slice(0, -1);
    return (
      <div className="relative flex h-full w-full flex-col items-center overflow-hidden px-[3%] pt-[2%] text-white">
        <div className="rounded-full border border-cyan-300/35 bg-slate-950/85 px-[2.5%] py-[.8%] text-center text-[clamp(12px,1.5vw,22px)] font-black uppercase tracking-[.1em] text-cyan-100">
          Word Chain · {chain.theme} · Round {chain.roundNumber}/5 · {chain.phase === 'tally' ? 'Tally' : chain.phase === 'review' ? 'Review' : 'Play'} {clock(chain.secondsLeft)}
        </div>
        {chain.phase === 'play' ? (
          <div className="mt-[1.5%] flex max-w-full flex-col items-center rounded-2xl bg-slate-950/80 px-[3%] py-[1.2%] text-center backdrop-blur-sm">
            <div className="max-w-full break-all text-[clamp(42px,8vw,112px)] font-black uppercase leading-none tracking-[.05em] drop-shadow-[0_0_22px_rgba(34,211,238,.7)]">
              {head}<span className="text-fuchsia-300">{chain.requiredLetter}</span>
            </div>
            <div className="mt-[1%] text-[clamp(12px,1.55vw,22px)] font-bold uppercase tracking-[.1em] text-cyan-100">
              Next: <span className="text-fuchsia-300">{chain.requiredLetter}</span> · {chain.chainLength} words · spmt &lt;word&gt;
            </div>
          </div>
        ) : (
          <div className="mt-[1.5%] flex max-h-[72%] w-full flex-col overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950/90 px-[3%] py-[1.5%] backdrop-blur-sm">
            <div className="text-center text-[clamp(18px,2.6vw,36px)] font-black uppercase text-cyan-100">
              Round tally · {chain.reviewWords.length} words
            </div>
            <div className="mt-1 text-center text-[clamp(11px,1.3vw,19px)] font-bold text-amber-100">
              {chain.phase === 'review' ? 'Vote spmt up <number> or spmt down <number> · ties and no votes count' : `Final: ${chain.lastTally?.accepted || 0} correct · ${chain.lastTally?.rejected || 0} voted down`}
            </div>
            <div className="mt-[1%] grid min-h-0 grid-cols-2 gap-x-[3%] gap-y-1 overflow-y-auto text-[clamp(11px,1.35vw,20px)] font-bold">
              {chain.reviewWords.map((entry) => (
                <div key={entry.number} className="truncate rounded bg-white/10 px-2 py-1">
                  #{entry.number} {entry.word} {chain.phase === 'tally' ? entry.accepted ? '✓' : '✕' : ''} · {entry.displayName} · {entry.points} · ↑{entry.up} ↓{entry.down}
                </div>
              ))}
            </div>
            <div className="mt-1 text-center text-[clamp(11px,1.3vw,18px)] text-cyan-100">
              {chain.reviewLeaders.map((entry, index) => `#${index + 1} ${entry.displayName} ${entry.points}`).join(' · ')}
            </div>
          </div>
        )}
        {battleBar}
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
      <div className={`absolute ${battle?.active ? 'bottom-[11%]' : 'bottom-[4%]'} text-[clamp(13px,1.6vw,23px)] font-bold uppercase tracking-[.14em] text-cyan-100/70`}>
        {phrase.solved ? 'Solved!' : 'Guess with spmt <your phrase>'}{phrase.submitterDisplayName ? ` · Submitted by ${phrase.submitterDisplayName}` : ''}
      </div>
      {battleBar}
    </div>
  );
}
