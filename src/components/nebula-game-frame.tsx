'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameHubGame } from '@/lib/game-hub-registry';
import type { GameHubChatEvent } from '@/components/game-hub-prototype-surface';

function prototypePath(game: GameHubGame, demo: boolean) {
  const filename = String(game.sourcePrototype || '').split('/').pop();
  if (!filename) return '';
  const query = new URLSearchParams({ embedded: '1', room: 'nebula-arcade' });
  if (demo) query.set('demo', '1');
  return `/nebula-arcade/games/${encodeURIComponent(filename)}?${query.toString()}`;
}

function originalGameMessage(gameId: string, messageValue: string) {
  const message = String(messageValue || '').trim();
  const command = message.match(/^!?@?spmt(?:\s+|$)(.*)$/i)?.[1]?.trim() || message;
  const parts = command.toLowerCase().split(/\s+/).filter(Boolean);

  if (gameId === 'chaosmode' && /^(explode|glitch|portal|shake)$/.test(parts[0] || '')) return `!${parts[0]}`;
  if ((gameId === 'chatwars' || gameId === 'colorwars') && /^(red|blue|green|yellow)$/.test(parts[0] || '')) return `!${parts[0]}`;
  if (gameId === 'chickenroyale') {
    if (parts[0] === 'launch' || parts[0] === 'start') return '!start';
    if (parts[0] === 'join' || parts[0] === 'chicken' || parts[0] === 'royale' || parts[0] === 'hatch') return '!join';
  }
  if (gameId === 'dancingparade' && /^(join|dance|leave|parade)$/.test(parts[0] || '')) {
    return parts[0] === 'parade' ? '!join' : `!${parts[0]}`;
  }
  if (gameId === 'emojitower' && (parts[0] === 'drop' || parts[0] === 'tower')) return parts[0] === 'drop' ? '!drop' : message;
  if (gameId === 'petrace' && (parts[0] === 'pet' || parts[0] === 'race' || parts[0] === 'join')) {
    return `!join${parts[1] ? ` ${parts[1]}` : ''}`;
  }
  if (gameId === 'pixelbattle' && parts[0] === 'paint') return parts.join(' ');
  if (gameId === 'treasurehunt' && parts[0] === 'dig') return `!dig${parts[1] ? ` ${parts[1]}` : ''}`;
  if (gameId === 'emojitower' && parts[0] === 'drop') return '!drop';
  return message;
}

export function NebulaGameFrame({
  game,
  events = [],
  demo = false,
  title,
}: {
  game: GameHubGame;
  events?: GameHubChatEvent[];
  demo?: boolean;
  title?: string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const deliveredRef = useRef(new Set<string>());
  const [ready, setReady] = useState(false);
  const src = useMemo(() => prototypePath(game, demo), [demo, game]);

  useEffect(() => {
    deliveredRef.current.clear();
    setReady(false);
  }, [src]);

  useEffect(() => {
    if (!ready || demo || !frameRef.current?.contentWindow) return;
    for (const event of events.slice(-100)) {
      if (!event.id || deliveredRef.current.has(event.id)) continue;
      deliveredRef.current.add(event.id);
      frameRef.current.contentWindow.postMessage({
        dataReceived: {
          overlayNinja: {
            chatname: event.displayName || event.username,
            chatmessage: originalGameMessage(game.id, event.message),
            nameColor: event.color || '#67e8f9',
            chatbadges: event.badges || {},
            type: 'twitch',
          },
        },
      }, window.location.origin);
    }
    if (deliveredRef.current.size > 300) {
      deliveredRef.current = new Set(events.slice(-100).map((event) => event.id));
    }
  }, [demo, events, game.id, ready]);

  if (!src) return null;
  return (
    <iframe
      ref={frameRef}
      src={src}
      title={title || `${game.name} game`}
      onLoad={() => setReady(true)}
      className="h-full min-h-0 w-full border-0 bg-transparent"
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
