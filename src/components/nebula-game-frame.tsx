'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameHubGame } from '@/lib/game-hub-registry';
import type { GameHubChatEvent } from '@/components/game-hub-prototype-surface';
import { nebulaPrototypeMessage } from '@/lib/nebula-game-message';

function prototypePath(game: GameHubGame, demo: boolean, channel: string, broadcastOnly: boolean) {
  const filename = String(game.sourcePrototype || '').split('/').pop();
  if (!filename) return '';
  // `embedded` keeps the parent chat/event bridge active in both the Nebula
  // popout and broadcast surfaces. `broadcast` alone strips the UI chrome.
  const query = new URLSearchParams({ embedded: '1', room: 'nebula-arcade' });
  if (broadcastOnly) query.set('broadcast', '1');
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
  broadcastOnly = false,
}: {
  game: GameHubGame;
  events?: GameHubChatEvent[];
  demo?: boolean;
  title?: string;
  channel?: string;
  broadcastOnly?: boolean;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const deliveredRef = useRef(new Set<string>());
  const eventsRef = useRef(events);
  const wordVoteOpenRef = useRef(false);
  const [ready, setReady] = useState(false);
  const src = useMemo(() => prototypePath(game, demo, channel, broadcastOnly), [broadcastOnly, channel, demo, game]);

  useEffect(() => { eventsRef.current = events; }, [events]);

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
            timestamp: event.at,
          },
        },
      }, window.location.origin);
    }
    if (deliveredRef.current.size > 300) {
      deliveredRef.current = new Set(events.slice(-100).map((event) => event.id));
    }
  }, [demo, events, game.id, ready]);

  useEffect(() => {
    if (!ready || demo || game.id !== 'wordchain') return;
    let timer: number | null = null;
    const receiveVoteRequest = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.type !== 'neutral-word-vote') return;
      if (wordVoteOpenRef.current) return;
      const word = String(event.data.word || '').trim().toUpperCase();
      const theme = String(event.data.theme || '').trim();
      if (!word || !theme) return;
      wordVoteOpenRef.current = true;
      const openedAt = Date.now();
      const closesAt = Math.max(openedAt, Number(event.data.closesAt || openedAt + 20_000));
      timer = window.setTimeout(() => {
        const voters = new Map<string, boolean>();
        for (const item of eventsRef.current) {
          const at = Date.parse(String(item.at || ''));
          if (!Number.isFinite(at) || at < openedAt || at > closesAt) continue;
          const vote = String(item.message || '').trim().toLowerCase().replace(/^!?@?spmt\s+/, '');
          if (!/^(yes|y|accept|no|n|reject)$/.test(vote)) continue;
          voters.set(String(item.userId || item.username || '').toLowerCase(), /^(yes|y|accept)$/.test(vote));
        }
        const votes = [...voters.values()];
        const yes = votes.filter(Boolean).length;
        const no = votes.length - yes;
        frameRef.current?.contentWindow?.postMessage({
          type: 'nebula-word-verdict',
          theme,
          word,
          accepted: votes.length === 0 || yes >= no,
        }, window.location.origin);
        wordVoteOpenRef.current = false;
        timer = null;
      }, Math.max(0, closesAt - openedAt));
    };
    window.addEventListener('message', receiveVoteRequest);
    return () => {
      window.removeEventListener('message', receiveVoteRequest);
      if (timer) window.clearTimeout(timer);
      wordVoteOpenRef.current = false;
    };
  }, [demo, game.id, ready]);

  useEffect(() => {
    if (!ready || demo || game.id !== 'phraseguess' || !channel) return;
    let cancelled = false;
    const syncRound = async () => {
      try {
        const response = await fetch(`/api/game-hub/phrase-round?channel=${encodeURIComponent(channel)}`, { cache: 'no-store' });
        const body = await response.json();
        if (!cancelled && response.ok && body.round) {
          frameRef.current?.contentWindow?.postMessage({ type: 'nebula-phrase-round', ...body.round }, window.location.origin);
        }
      } catch {}
    };
    void syncRound();
    const timer = window.setInterval(() => void syncRound(), 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [channel, demo, game.id, ready]);

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
