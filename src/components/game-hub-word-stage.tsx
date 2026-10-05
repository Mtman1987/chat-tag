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
  lastPlay?: { word: string; displayName: string; points: number; combo: number; position: number } | null;
  gameEnded: boolean;
  gameParticipants: Array<{ displayName: string; points: number }>;
  gameWinner?: { displayName: string; points: number } | null;
  gameWinners: Array<{ displayName: string; points: number }>;
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
          SPMT &lt;WORD&gt; · {chain.theme} · Round {chain.roundNumber}/5 · {chain.gameEnded ? 'GAME OVER' : chain.phase === 'tally' ? 'Results' : chain.phase === 'review' ? 'Vote' : 'Play'} {clock(chain.secondsLeft)}
        </div>
        {chain.phase === 'play' ? (
          <div className="mt-[2%] flex max-w-full flex-col items-center px-[3%] py-[1.2%] text-center">
            <div className="max-w-full break-all text-[clamp(42px,8vw,112px)] font-black uppercase leading-none tracking-[.05em] drop-shadow-[0_0_22px_rgba(34,211,238,.7)]">
              {chain.currentWord ? <>{head}<span className="text-fuchsia-300">{chain.requiredLetter}</span></> : 'Start with any word'}
            </div>
          </div>
        ) : chain.gameEnded ? (
          <div className="mt-[1.5%] flex max-h-[76%] w-full max-w-[94%] flex-col overflow-hidden rounded-2xl border border-amber-300/45 bg-slate-950/92 px-[4%] py-[2%] text-center shadow-[0_0_34px_rgba(250,204,21,.18)] backdrop-blur-sm">
            <div className="text-[clamp(28px,4.5vw,64px)] font-black uppercase tracking-[.08em] text-amber-200">GAME OVER</div>
            <div className="mt-1 text-[clamp(12px,1.8vw,24px)] font-black uppercase tracking-[.12em] text-cyan-100">
              Five rounds complete · final standings
            </div>
            <div className="mt-[2%] text-[clamp(18px,2.8vw,40px)] font-black text-white">
              {chain.gameWinners.length > 1
                ? `Tie: ${chain.gameWinners.map((entry) => entry.displayName).join(' & ')} · ${chain.gameWinners[0]?.points || 0} pts`
                : chain.gameWinner
                  ? `🏆 ${chain.gameWinner.displayName} wins · ${chain.gameWinner.points} pts`
                  : 'No scored plays this game'}
            </div>
            <div className="mt-[2%] grid min-h-0 grid-cols-2 gap-2 overflow-y-auto text-left text-[clamp(11px,1.45vw,20px)] font-bold">
              {chain.gameParticipants.map((entry, index) => (
                <div key={entry.displayName + index} className="flex justify-between gap-3 rounded-lg bg-white/10 px-3 py-2">
                  <span>#{index + 1} {entry.displayName}</span><strong>{entry.points} total · {chain.reviewLeaders.find(player => player.displayName === entry.displayName)?.points || 0} round</strong>
                </div>
              ))}
            </div>
            <div className="mt-1 text-center text-[clamp(11px,1.3vw,18px)] font-bold text-amber-200">
              Overall top 3: {chain.gameParticipants.slice(0, 3).map((entry, index) => `#${index + 1} ${entry.displayName} (${entry.points})`).join(' · ') || 'No scores yet'}
            </div>
            <div className="mt-2 text-[clamp(10px,1.25vw,17px)] font-bold uppercase tracking-[.1em] text-cyan-100/75">
              Next game begins in {clock(chain.secondsLeft)}
            </div>
          </div>
        ) : (
          <div className="mt-[1.5%] flex max-h-[72%] w-full flex-col overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950/90 px-[3%] py-[1.5%] backdrop-blur-sm">
            <div className="text-center text-[clamp(18px,2.6vw,36px)] font-black uppercase text-cyan-100">
              {chain.phase === 'review' ? 'VOTING OPEN' : 'ROUND RESULTS'} · {chain.reviewWords.length} words
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
              Round scores: {chain.reviewLeaders.map((entry) => `${entry.displayName} (${entry.points})`).join(' · ') || 'No plays this round'}
            </div>
            {chain.phase === 'tally' ? <div className="mt-1 text-center text-[clamp(11px,1.3vw,18px)] font-bold text-amber-200">
              Overall top 3: {chain.gameParticipants.slice(0, 3).map((entry, index) => `#${index + 1} ${entry.displayName} (${entry.points})`).join(' · ') || 'No scores yet'}
            </div> : null}
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
