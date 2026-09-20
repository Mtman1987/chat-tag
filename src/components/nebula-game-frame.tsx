'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameHubGame } from '@/lib/game-hub-registry';
import type { GameHubChatEvent } from '@/components/game-hub-prototype-surface';
import { nebulaPrototypeMessage } from '@/lib/nebula-game-message';

function prototypePath(game: GameHubGame, demo: boolean, channel: string) {
  const filename = String(game.sourcePrototype || '').split('/').pop();
  if (!filename) return '';
  const query = new URLSearchParams({ embedded: '1', room: 'nebula-arcade' });
  if (channel) query.set('channel', channel);
  if (demo) query.set('demo', '1');
  return `/nebula-arcade/games/${encodeURIComponent(filename)}?${query.toString()}`;
}

export function NebulaGameFrame({
  game,
  events = [],
  demo = false,
  title,
  channel = '',
}: {
  game: GameHubGame;
  events?: GameHubChatEvent[];
  demo?: boolean;
  title?: string;
  channel?: string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const deliveredRef = useRef(new Set<string>());
  const [ready, setReady] = useState(false);
  const src = useMemo(() => prototypePath(game, demo, channel), [channel, demo, game]);

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
            chatmessage: nebulaPrototypeMessage(game.id, event.message),
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
