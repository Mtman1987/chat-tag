'use client';

import type { GameHubGame } from '@/lib/game-hub-registry';
import { GameHubPrototypeSurface, type GameHubChatEvent } from '@/components/game-hub-prototype-surface';
import { GameHubBingoSurface } from '@/components/game-hub-bingo-surface';

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
    content = <GameHubBingoSurface channel={channel || 'chat'} />;
  } else {
    content = <GameHubPrototypeSurface game={game} events={eventsForGame(events, game.id)} channel={channel || 'chat'} />;
  }

  return (
    <section className="h-full min-h-0 w-full overflow-hidden rounded-2xl" data-game-hub-surface={game.id}>
      {content}
    </section>
  );
}
