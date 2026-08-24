'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { GameHubGame } from '@/lib/game-hub-catalog';
import { useSession } from '@/contexts/session-context';
import { ChatTagGame } from '@/components/chat-tag-game';
import { QuackverseCardGame } from '@/components/quackverse-card-game';
import { BingoCard } from '@/components/bingo-card';
import { GameHubPrototypeSurface, type GameHubChatEvent } from '@/components/game-hub-prototype-surface';
import { NebulaGameFrame } from '@/components/nebula-game-frame';

type ScopedGameEvent = GameHubChatEvent & { gameIds?: string[] };
type RuntimeAction = {
  id: string;
  at: string;
  channel: string;
  gameId: string;
  username: string;
  displayName: string;
  message: string;
};

function normalizeChannel(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^#/, '');
}

function eventsForGame(events: GameHubChatEvent[], gameId: string) {
  return events.filter((event) => Array.isArray((event as ScopedGameEvent).gameIds) && (event as ScopedGameEvent).gameIds!.includes(gameId));
}

function isSpmtCommand(message: string) {
  return /^!?@?spmt(?:\s|$)/i.test(String(message || '').trim());
}

export function GameHubPlayPanel({ game }: { game: GameHubGame }) {
  const params = useSearchParams();
  const { user } = useSession();
  const channel = normalizeChannel(params.get('channel') || user?.twitchUsername || '');
  const [events, setEvents] = useState<GameHubChatEvent[]>([]);
  const [active, setActive] = useState<boolean | null>(null);
  const latestChatId = useRef('');
  const latestRuntimeId = useRef('');

  useEffect(() => {
    if (!channel || game.id === 'chat-tag' || game.id === 'quackverse' || game.id === 'bingo') return;
    let cancelled = false;
    latestChatId.current = '';
    latestRuntimeId.current = '';
    setEvents([]);

    function mergeEvents(incoming: GameHubChatEvent[]) {
      if (!incoming.length || cancelled) return;
      setEvents((current) => {
        const merged = new Map(current.map((event) => [event.id, event]));
        for (const event of incoming) merged.set(event.id, event);
        return [...merged.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-250);
      });
    }

    async function pollChat() {
      const query = new URLSearchParams({ channel });
      if (latestChatId.current) query.set('after', latestChatId.current);
      try {
        const response = await fetch(`/api/overlay/game-hub/events?${query.toString()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json();
        const raw = Array.isArray(body.events) ? body.events as GameHubChatEvent[] : [];
        if (raw.length) latestChatId.current = String(body.latestId || raw.at(-1)?.id || latestChatId.current);
        mergeEvents(raw.filter((event) => !isSpmtCommand(event.message)));
      } catch {}
    }

    async function pollRuntime() {
      const query = new URLSearchParams({ channel, games: game.id });
      if (latestRuntimeId.current) query.set('after', latestRuntimeId.current);
      try {
        const response = await fetch(`/api/overlay/game-hub/runtime?${query.toString()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json();
        const actions = Array.isArray(body.actions) ? body.actions as RuntimeAction[] : [];
        if (actions.length) latestRuntimeId.current = String(body.latestId || actions.at(-1)?.id || latestRuntimeId.current);
        mergeEvents(actions.map((action) => ({
          id: action.id,
          at: action.at,
          channel: action.channel,
          username: action.username,
          displayName: action.displayName,
          message: action.message,
          gameIds: [action.gameId],
        }) as GameHubChatEvent));
      } catch {}
    }

    void pollChat();
    void pollRuntime();
    const timer = window.setInterval(() => {
      void pollChat();
      void pollRuntime();
    }, 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [channel, game.id]);

  useEffect(() => {
    if (!channel) { setActive(null); return; }
    let cancelled = false;
    async function loadScope() {
      try {
        const response = await fetch(`/api/game-hub/channel?channel=${encodeURIComponent(channel)}`, { cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) setActive(Array.isArray(body.gameIds) ? body.gameIds.includes(game.id) : false);
      } catch {}
    }
    void loadScope();
    const timer = window.setInterval(() => void loadScope(), 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [channel, game.id]);

  const runtime = useMemo(() => {
    if (channel && active === false) {
      return <div className="grid min-h-72 place-items-center rounded-2xl border border-white/10 bg-black/25 p-8 text-center"><div><div className="text-sm font-bold text-slate-200">{game.name} is STOPPED in #{channel}</div><p className="mt-2 text-xs text-slate-500">Start it from this page or type <code className="text-cyan-100">spmt start</code> and choose the game.</p></div></div>;
    }
    if (game.id === 'chat-tag') return <ChatTagGame />;
    if (game.id === 'quackverse') return <QuackverseCardGame />;
    if (game.id === 'bingo') return <BingoCard />;
    if (!channel) return <div className="grid min-h-72 place-items-center rounded-2xl border border-white/10 bg-black/25 p-8 text-center text-sm text-slate-400">Open this page while signed in, or add <code className="mx-1 text-cyan-100">?channel=streamer</code>, to attach the live chat surface.</div>;
    if (game.sourcePrototype) return <div className="h-[min(62vh,620px)] min-h-80"><NebulaGameFrame game={game} events={eventsForGame(events, game.id)} /></div>;
    return <div className="h-[min(62vh,620px)] min-h-80"><GameHubPrototypeSurface game={game} events={eventsForGame(events, game.id)} channel={channel} /></div>;
  }, [active, channel, events, game]);

  return (
    <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-headline text-xl text-white">Play</h2>
          <p className="mt-1 text-xs text-slate-500">Every Nebula Arcade title gets the same gameplay slot. Joined players feed durable game actions while it is ACTIVE.</p>
        </div>
        {channel && <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${active ? 'bg-emerald-300/10 text-emerald-100' : 'bg-white/8 text-slate-400'}`}>{active ? 'ACTIVE' : active === false ? 'STOPPED' : 'CHECKING'} · #{channel}</span>}
      </div>
      {runtime}
    </section>
  );
}
