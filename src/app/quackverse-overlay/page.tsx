'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { quackverseCards } from '@/lib/quackverse-data';
import {
  defaultQuackverseState,
  quackverseGridSize,
  type QuackverseSavedState,
} from '@/lib/quackverse-state';
import { quackverseRoomIdFromParams, quackverseRoomLabel, quackverseScopeFromParams } from '@/lib/quackverse-rooms';
import { cn } from '@/lib/utils';

type RecentPackEvent = {
  id: string;
  at: string;
  twitchUsername: string;
  packsRemaining: number;
  cards: Array<{ id: number; name: string; rarity?: string }>;
  packImageUrl: string;
};

const players = {
  playerOne: { label: 'Player 1', short: 'P1', accent: 'border-cyan-300 bg-cyan-400/15 text-cyan-50' },
  playerTwo: { label: 'Player 2', short: 'P2', accent: 'border-rose-300 bg-rose-400/15 text-rose-50' },
} as const;

const numberFromText = (text: string, pattern: RegExp) => {
  const match = text.match(pattern);
  return match ? Number(match[1]) : 0;
};

function getEffectiveStats(piece: { cardId: number; equipmentIds?: number[]; fatigue?: number; statModifiers?: { atk?: number; def?: number; spd?: number } }) {
  const card = quackverseCards.find((item) => item.id === piece.cardId);
  const equipmentIds = piece.equipmentIds || [];
  const effectText = equipmentIds
    .map((id) => quackverseCards.find((item) => item.id === id)?.effect || '')
    .join(' ');
  const fatigue = Number(piece.fatigue || 0);
  const modifiers = piece.statModifiers || {};
  const damageReduction = numberFromText(effectText, /(?:Reduce damage taken by|Reduce all damage by)\s*(\d+)/i);

  return {
    atk: Math.max(1, (card?.atk || 0) + Number(modifiers.atk || 0) + numberFromText(effectText, /\+(\d+)\s*ATK/i) - fatigue - damageReduction),
    def: Math.max(0, (card?.def || 0) + Number(modifiers.def || 0) + numberFromText(effectText, /\+(\d+)\s*DEF/i) + damageReduction),
    spd: Math.max(1, (card?.spd || 0) + Number(modifiers.spd || 0) + numberFromText(effectText, /\+(\d+)\s*SPD/i) - fatigue),
  };
}

export default function QuackverseOverlayPage() {
  const [state, setState] = useState<QuackverseSavedState>(defaultQuackverseState);
  const [roomScope, setRoomScope] = useState('');
  const [roomId, setRoomId] = useState('default');
  const [recentPack, setRecentPack] = useState<RecentPackEvent | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const nextScope = quackverseScopeFromParams(params);
    const nextRoomId = quackverseRoomIdFromParams(params);
    const roomQuery = new URLSearchParams({ roomId: nextRoomId });
    if (nextScope) roomQuery.set('tenant', nextScope);
    setRoomScope(nextScope);
    setRoomId(nextRoomId);

    async function loadState() {
      try {
        const response = await fetch(`/api/quackverse/state?${roomQuery.toString()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setState(data.state);
      } catch {}
    }

    loadState();
    const interval = setInterval(loadState, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let lastSeenPackId = '';

    async function loadRecentPack() {
      try {
        const response = await fetch('/api/quackverse/pack?recent=1&limit=1', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        const event = Array.isArray(data.events) ? data.events[0] as RecentPackEvent | undefined : undefined;
        if (!event?.id || cancelled) return;
        if (!lastSeenPackId) {
          lastSeenPackId = event.id;
          setRecentPack(event);
          return;
        }
        if (event.id !== lastSeenPackId) {
          lastSeenPackId = event.id;
          setRecentPack(event);
        }
      } catch {}
    }

    loadRecentPack();
    const interval = setInterval(loadRecentPack, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!recentPack) return;
    const timer = window.setTimeout(() => setRecentPack(null), 15000);
    return () => window.clearTimeout(timer);
  }, [recentPack]);

  return (
    <main className="h-dvh w-dvw overflow-hidden bg-transparent p-[min(1.5vw,1rem)] text-white">
      <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-[min(1vw,0.75rem)]">
        <header className="shrink-0 rounded-lg border border-white/10 bg-black/20 p-[min(1vw,0.75rem)] backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-headline text-[clamp(1rem,2vw,1.75rem)]">Quackverse Space-Force</h1>
            <p className="text-sm text-slate-300">Room {quackverseRoomLabel(roomScope, roomId)} · Turn {state.turnNumber} · {players[state.activePlayer].label}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <div className="rounded-md border border-cyan-300/40 bg-cyan-300/10 px-3 py-2">P1 {state.score.playerOne}/6 VP · KOs {state.koCount.playerOne}</div>
            <div className="rounded-md border border-rose-300/40 bg-rose-300/10 px-3 py-2">P2 {state.score.playerTwo}/6 VP · KOs {state.koCount.playerTwo}</div>
            {state.winner && (
              <div className="rounded-md border border-amber-200/60 bg-amber-300/20 px-3 py-2 text-amber-100">
                {players[state.winner].label} wins
              </div>
            )}
          </div>
          </div>
        </header>

        <section className="shrink-0 rounded-lg border border-white/10 bg-black/20 p-[min(1vw,0.75rem)] backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-white">Active Hand</div>
            <div className="text-xs text-slate-400">
              Draw {state.battlePiles[state.activePlayer].drawPile.length} · Discard {state.battlePiles[state.activePlayer].discardPile.length} · Hand {state.battlePiles[state.activePlayer].hand.length}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {state.battlePiles[state.activePlayer].hand.length === 0 ? (
              <div className="rounded-md border border-dashed border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-500">No cards in hand.</div>
            ) : (
              state.battlePiles[state.activePlayer].hand.map((instance) => {
                const card = quackverseCards.find((item) => item.id === instance.cardId);
                if (!card) return null;
                return (
                  <div key={instance.instanceId} className="min-w-[8rem] rounded-md border border-white/10 bg-white/[0.04] px-3 py-2">
                    <div className="text-[0.65rem] uppercase text-slate-400">{card.type}</div>
                    <div className="font-semibold text-white">{card.name}</div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <div className="grid min-h-0 flex-1 gap-[min(1vw,0.75rem)] xl:grid-cols-[minmax(0,1fr)_minmax(240px,22vw)]">
          <section className="flex min-h-0 items-center justify-center rounded-lg border border-white/5 bg-transparent p-[min(1vw,0.75rem)]">
            <div className="grid aspect-square h-full max-h-full max-w-full grid-cols-7 gap-[min(0.55vw,0.5rem)]">
              {state.grid.map((piece, index) => {
                const card = piece ? quackverseCards.find((item) => item.id === piece.cardId) : null;
                const stats = piece ? getEffectiveStats(piece) : null;
                const row = Math.floor(index / quackverseGridSize);
                const isP1Entry = row === quackverseGridSize - 1;
                const isP2Entry = row === 0;

                return (
                  <div
                    key={index}
                    className={cn(
                      'aspect-square min-h-0 rounded-lg border bg-transparent p-[min(0.6vw,0.5rem)] text-center',
                      isP1Entry && 'border-cyan-300/25 shadow-[inset_0_0_18px_rgba(34,211,238,0.08)]',
                      isP2Entry && 'border-rose-300/25 shadow-[inset_0_0_18px_rgba(251,113,133,0.08)]',
                      !isP1Entry && !isP2Entry && 'border-white/5',
                      piece && players[piece.owner].accent,
                    )}
                  >
                    {piece && card ? (
                      <div className="flex h-full flex-col overflow-hidden rounded-lg">
                        <div className="relative flex-1 overflow-hidden rounded-lg">
                          {card.artUrl ? (
                            <Image
                              src={card.artUrl}
                              alt={card.name}
                              width={320}
                              height={180}
                              unoptimized
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-slate-900 text-xs text-slate-500">
                              No art
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                          <div className="absolute inset-x-0 top-0 flex justify-between gap-1 p-2 text-[clamp(0.5rem,0.75vw,0.7rem)]">
                            <span className="rounded bg-black/45 px-1.5 py-0.5">{players[piece.owner].short}</span>
                            <span>#{index + 1}</span>
                          </div>
                          <div className="absolute inset-x-0 bottom-0 p-2">
                            <div className="px-1 text-[clamp(0.52rem,0.85vw,0.82rem)] font-semibold leading-tight">{card.name}</div>
                            <div>
                              <div className="grid grid-cols-4 gap-1 text-[clamp(0.45rem,0.65vw,0.65rem)] text-slate-200">
                                <span>ATK {stats?.atk}</span>
                                <span>DEF {stats?.def}</span>
                                <span>SPD {stats?.spd}</span>
                                <span>HP {piece.currentHp}</span>
                              </div>
                              {!!piece.equipmentIds?.length && (
                                <div className="mt-1 text-[clamp(0.45rem,0.65vw,0.62rem)] text-cyan-100">Gear x{piece.equipmentIds.length}</div>
                              )}
                              {piece.fatigued && <div className="text-[clamp(0.45rem,0.65vw,0.62rem)] text-amber-100">Fatigued</div>}
                              <div className="mt-1 h-1.5 rounded-full bg-black/50">
                                <div
                                  className="h-full rounded-full bg-emerald-300"
                                  style={{ width: `${Math.max(4, (piece.currentHp / piece.maxHp) * 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-600">{index + 1}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="min-h-0 overflow-hidden rounded-lg border border-white/10 bg-black/20 p-[min(1vw,0.75rem)] backdrop-blur-sm">
            <h2 className="font-headline text-[clamp(0.9rem,1.5vw,1.25rem)]">Match Log</h2>
            <div className="mt-2 space-y-2">
              {state.matchLog.slice(0, 6).map((entry, index) => (
                <div key={`${entry}-${index}`} className="rounded-md bg-white/[0.06] p-2 text-[clamp(0.58rem,0.9vw,0.85rem)] text-slate-200">
                  {entry}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>

      {recentPack && (
        <aside className="pointer-events-none fixed bottom-[min(3vw,2rem)] left-1/2 w-[min(92vw,54rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-cyan-200/50 bg-slate-950/90 shadow-[0_0_60px_rgba(34,211,238,0.35)] backdrop-blur-md">
          <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_15rem] sm:items-center">
            <div className="min-w-0">
              <div className="text-[0.7rem] uppercase tracking-normal text-cyan-100/80">Quackverse pack opened</div>
              <div className="truncate font-headline text-[clamp(1rem,2vw,1.65rem)] text-white">
                @{recentPack.twitchUsername || 'player'}
              </div>
              <div className="mt-1 line-clamp-2 text-sm text-slate-200">
                {recentPack.cards.map((card) => card.name).filter(Boolean).join(' · ') || 'New cards revealed'}
              </div>
              <div className="mt-2 text-xs text-slate-400">{recentPack.packsRemaining}/3 packs left today</div>
            </div>
            {recentPack.packImageUrl && (
              <Image
                src={`${recentPack.packImageUrl}${recentPack.packImageUrl.includes('?') ? '&' : '?'}overlay=1`}
                alt=""
                width={480}
                height={270}
                unoptimized
                className="h-auto w-full rounded-xl border border-white/10 object-cover"
              />
            )}
          </div>
        </aside>
      )}
    </main>
  );
}
