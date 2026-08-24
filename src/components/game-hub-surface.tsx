'use client';

import type { GameHubGame } from '@/lib/game-hub-registry';
import { GameHubPrototypeSurface, type GameHubChatEvent } from '@/components/game-hub-prototype-surface';
import { GameHubBingoSurface } from '@/components/game-hub-bingo-surface';
import { NebulaGameFrame } from '@/components/nebula-game-frame';

type ScopedGameEvent = GameHubChatEvent & { gameIds?: string[] };

function tagOverlayUserId(ownerUserId: string) {
  const value = String(ownerUserId || '').trim();
  return value.startsWith('user_') ? value : `user_${value}`;
}

function eventsForGame(events: GameHubChatEvent[], gameId: string) {
  return events.filter((event) => Array.isArray((event as ScopedGameEvent).gameIds) && (event as ScopedGameEvent).gameIds!.includes(gameId));
}

export function GameHubSurface({
  game,
  events,
  channel,
  ownerUserId,
}: {
  game: GameHubGame;
  events: GameHubChatEvent[];
  channel: string;
  ownerUserId: string;
}) {
  let content: React.ReactNode;

  if (game.id === 'chat-tag') {
    const source = `/overlay/${encodeURIComponent(tagOverlayUserId(ownerUserId))}?cycle=420&hudOn=45&hudOff=120`;
    content = <iframe src={source} title={`${game.name} overlay`} className="h-full w-full border-0 bg-transparent" />;
  } else if (game.id === 'quackverse') {
    const query = channel ? `?tenant=${encodeURIComponent(channel)}` : '';
    content = <iframe src={`/quackverse-overlay${query}`} title={`${game.name} overlay`} className="h-full w-full border-0 bg-transparent" />;
  } else if (game.id === 'bingo') {
    content = <GameHubBingoSurface />;
  } else if (game.sourcePrototype) {
    content = <NebulaGameFrame game={game} events={eventsForGame(events, game.id)} />;
  } else {
    content = <GameHubPrototypeSurface game={game} events={eventsForGame(events, game.id)} channel={channel || 'chat'} />;
  }

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950/70 text-white shadow-2xl backdrop-blur" data-game-hub-surface={game.id}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[.18em] text-cyan-200/60">Nebula Arcade</div>
          <h2 className="truncate text-sm font-bold">{game.name}</h2>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-300/10 px-2 py-1 text-[9px] font-bold text-emerald-100">ACTIVE · #{channel}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{content}</div>
    </section>
  );
}
