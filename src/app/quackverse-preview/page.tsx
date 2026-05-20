'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { quackverseCards, type QuackverseCard } from '@/lib/quackverse-data';
import { getQuackverseFamilyGroup } from '@/lib/quackverse-family-map';
import { cn } from '@/lib/utils';

const card = (quackverseCards.find((item) => item.id === 4) || quackverseCards[0]) as QuackverseCard;
const boardSize = 7;
const startIndex = 24;

const statRows = [
  ['ATK', card.atk],
  ['DEF', card.def],
  ['SPD', card.spd],
  ['SPC', card.spc],
  ['HP', card.hp],
] as const;

function makeBoard(fillIndex: number | null) {
  return Array.from({ length: boardSize * boardSize }, (_, index) => (index === fillIndex ? card.id : null));
}

export default function QuackversePreviewPage() {
  const [artVisible, setArtVisible] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(startIndex);
  const [dragging, setDragging] = useState(false);
  const [animationNonce, setAnimationNonce] = useState(0);
  const family = useMemo(() => getQuackverseFamilyGroup(card.id), []);
  const showBoardStats = artVisible || dragging;
  const hoverResetTimer = useRef<number | null>(null);
  const hoverLoopTimer = useRef<number | null>(null);
  const hoverStartedAt = useRef<number | null>(null);

  const staticUrl = card.artUrl || '';
  const hoverUrl = card.artHoverUrl || staticUrl;
  const hoverDurationMs = card.artHoverDurationMs ?? 10000;
  const src = artVisible || dragging ? `${hoverUrl}${hoverUrl.includes('?') ? '&' : '?'}v=${animationNonce}` : staticUrl;
  const board = makeBoard(selectedIndex);

  const clearHoverResetTimer = () => {
    if (hoverResetTimer.current !== null) {
      window.clearTimeout(hoverResetTimer.current);
      hoverResetTimer.current = null;
    }
  };

  const clearHoverLoopTimer = () => {
    if (hoverLoopTimer.current !== null) {
      window.clearInterval(hoverLoopTimer.current);
      hoverLoopTimer.current = null;
    }
  };

  const markAnimationRestart = () => {
    hoverStartedAt.current = Date.now();
    setAnimationNonce((value) => value + 1);
  };

  const startHoverPlayback = () => {
    clearHoverResetTimer();
    clearHoverLoopTimer();
    setArtVisible(true);
    markAnimationRestart();
    hoverLoopTimer.current = window.setInterval(() => {
      markAnimationRestart();
    }, hoverDurationMs);
  };

  const stopHoverPlayback = () => {
    clearHoverLoopTimer();
    clearHoverResetTimer();
    const startedAt = hoverStartedAt.current;
    const elapsed = startedAt ? Date.now() - startedAt : hoverDurationMs;
    const remainingMs = Math.max(0, hoverDurationMs - elapsed);
    hoverResetTimer.current = window.setTimeout(() => {
      setArtVisible(false);
      hoverResetTimer.current = null;
    }, remainingMs + 500);
  };

  const showAnimatedArt = () => {
    startHoverPlayback();
  };

  const hideAnimatedArt = () => {
    stopHoverPlayback();
  };

  const moveTo = (index: number) => setSelectedIndex(index);

  useEffect(() => () => {
    clearHoverResetTimer();
    clearHoverLoopTimer();
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-black/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-headline text-2xl">Quackverse Preview Sandbox</h1>
            <p className="text-sm text-slate-300">
              Public demo for the Photon Ranger Featherbolt card. Click a board square or drag the card to move it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-cyan-300/50 text-cyan-100">Card #{card.id}</Badge>
            <Badge variant="outline" className="border-white/20 text-slate-200">{family?.label || 'Unsorted'}</Badge>
            <Badge variant="outline" className="border-fuchsia-300/50 text-fuchsia-100">
              {artVisible || dragging ? 'gif loops while highlighted' : 'static image'}
            </Badge>
            <Badge variant="outline" className="border-emerald-300/50 text-emerald-100">
              {hoverDurationMs}ms + 500ms fallback
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/quackverse-guide">Open guide</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(380px,440px)_minmax(0,1fr)]">
          <Card className="border-white/10 bg-black/30">
            <CardHeader>
              <CardTitle className="font-headline text-2xl">{card.name}</CardTitle>
              <CardDescription className="text-slate-300">
                {card.type} · {card.role || 'No role'} · {card.rarity || 'Gear'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                draggable
                onDragStart={() => {
                  clearHoverResetTimer();
                  setDragging(true);
                  showAnimatedArt();
                }}
                onDragEnd={() => {
                  setDragging(false);
                  hideAnimatedArt();
                }}
                className="overflow-hidden rounded-xl border border-cyan-300/30 bg-slate-900"
                onMouseEnter={showAnimatedArt}
                onMouseLeave={hideAnimatedArt}
              >
                {src ? (
                  <img src={src} alt={card.name} className="aspect-[5/3] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[5/3] items-center justify-center text-slate-400">No art loaded</div>
                )}
              </div>

              <div className="grid grid-cols-5 gap-2">
                {statRows.map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-center">
                    <div className="text-[0.65rem] uppercase text-slate-400">{label}</div>
                    <div className="text-xl font-bold text-white">{value ?? 0}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <div className="mb-2 text-sm font-semibold text-white">Abilities</div>
                <div className="space-y-2 text-sm text-slate-300">
                  {card.abilities.length ? card.abilities.map((ability) => (
                    <div key={ability} className="rounded-md bg-black/20 p-2">
                      {ability}
                    </div>
                  )) : (
                    <div className="rounded-md bg-black/20 p-2">{card.effect || 'No abilities listed.'}</div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm italic text-slate-300">
                {card.flavor}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-black/25 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-headline text-lg text-white">Board Sandbox</h2>
                  <p className="text-sm text-slate-400">Drop the sample onto any square. Click the card, then click a square if you prefer.</p>
                </div>
                <Button type="button" variant="secondary" onClick={() => moveTo(startIndex)}>
                  Reset
                </Button>
              </div>

              <div className="grid gap-1 sm:gap-2" style={{ gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))` }}>
                {board.map((value, index) => {
                  const isOccupied = value === card.id;
                  const row = Math.floor(index / boardSize);
                  const col = index % boardSize;
                  const isBackRow = row === 0 || row === boardSize - 1;
                  return (
                    <button
                      key={index}
                      type="button"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        moveTo(index);
                      }}
                      onClick={() => moveTo(index)}
                      className={cn(
                        'relative aspect-square overflow-hidden rounded-lg border transition',
                        isOccupied ? 'border-cyan-300 bg-cyan-300/10' : 'border-white/10 bg-white/[0.03] hover:border-cyan-300/50 hover:bg-white/[0.05]',
                        isBackRow && 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]',
                      )}
                    >
                      {isOccupied ? (
                        <div className="flex h-full w-full flex-col overflow-hidden rounded-lg">
                          <div className="flex items-start justify-between gap-2 p-2 text-[0.58rem]">
                            <span className="rounded bg-black/45 px-1.5 py-0.5 font-semibold text-white">P4</span>
                            <span className="rounded bg-black/45 px-1.5 py-0.5 text-cyan-100">drag me</span>
                          </div>
                          <div className="relative flex-1">
                            <img
                              draggable
                              onDragStart={() => {
                                clearHoverResetTimer();
                                setDragging(true);
                                showAnimatedArt();
                              }}
                              onDragEnd={() => {
                                setDragging(false);
                                hideAnimatedArt();
                              }}
                              src={src}
                              alt={card.name}
                              className="h-full w-full object-cover"
                              onMouseEnter={showAnimatedArt}
                              onMouseLeave={hideAnimatedArt}
                            />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2">
                              {showBoardStats ? (
                                <div className="text-[0.58rem] text-slate-200">
                                  ATK {card.atk} · DEF {card.def} · SPD {card.spd} · SPC {card.spc} · HP {card.hp}
                                </div>
                              ) : (
                                <>
                                  <div className="text-[0.65rem] font-semibold leading-tight text-white">{card.name}</div>
                                  <div className="text-[0.58rem] text-slate-200">{family?.label || 'Unsorted schema'}</div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[0.6rem] text-slate-500">
                          {index + 1}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-black/25 p-4">
                <div className="mb-2 text-sm font-semibold text-white">How it behaves</div>
                <div className="space-y-2 text-sm text-slate-300">
                  <div className="rounded-md bg-white/[0.04] p-2">Hover the card art to swap the static image for the GIF.</div>
                  <div className="rounded-md bg-white/[0.04] p-2">While highlighted, the GIF restarts every full cycle so it can loop cleanly.</div>
                  <div className="rounded-md bg-white/[0.04] p-2">When you stop hovering, the current loop finishes and the PNG comes back 500ms later.</div>
                  <div className="rounded-md bg-white/[0.04] p-2">Drag the card, or click a new square to move it across the board.</div>
                  <div className="rounded-md bg-white/[0.04] p-2">The board is public and is meant to be a simple demo, not the full match engine.</div>
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/25 p-4">
                <div className="mb-2 text-sm font-semibold text-white">Card ID</div>
                <div className="space-y-2 text-sm text-slate-300">
                  <div className="rounded-md bg-white/[0.04] p-2">Find it in <span className="font-mono text-cyan-100">src/lib/quackverse-data.ts</span>.</div>
                  <div className="rounded-md bg-white/[0.04] p-2">Photon Ranger Featherbolt is <span className="font-mono text-cyan-100">#4</span>.</div>
                  <div className="rounded-md bg-white/[0.04] p-2">Its family tag is in <span className="font-mono text-cyan-100">src/lib/quackverse-family-map.ts</span>.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
