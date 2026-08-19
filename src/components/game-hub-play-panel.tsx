'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { GameHubGame } from '@/lib/game-hub-catalog';
import { getCanonicalGameCommandSpec } from '@/lib/game-hub-commands';
import { useSession } from '@/contexts/session-context';
import { ChatTagGame } from '@/components/chat-tag-game';
import { QuackverseCardGame } from '@/components/quackverse-card-game';
import { BingoCard } from '@/components/bingo-card';
import { GameHubPrototypeSurface, type GameHubChatEvent } from '@/components/game-hub-prototype-surface';

type ScopedGameEvent = GameHubChatEvent & { gameIds?: string[] };

function normalizeChannel(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^#/, '');
}

function eventsForGame(events: GameHubChatEvent[], gameId: string) {
  return events.filter((event) => Array.isArray((event as ScopedGameEvent).gameIds) && (event as ScopedGameEvent).gameIds!.includes(gameId));
}

export function GameHubPlayPanel({ game }: { game: GameHubGame }) {
  const params = useSearchParams();
  const { user } = useSession();
  const channel = normalizeChannel(params.get('channel') || user?.twitchUsername || '');
  const commandKey = getCanonicalGameCommandSpec(game)?.key || game.id;
  const [events, setEvents] = useState<GameHubChatEvent[]>([]);
  const [active, setActive] = useState<boolean | null>(null);
  const latestId = useRef('');

  useEffect(() => {
    if (!channel || game.id === 'chat-tag' || game.id === 'quackverse' || game.id === 'bingo') return;
    let cancelled = false;
    latestId.current = '';
    setEvents([]);

    async function pollEvents() {
      const query = new URLSearchParams({ channel });
      if (latestId.current) query.set('after', latestId.current);
      try {
        const response = await fetch(`/api/overlay/game-hub/events?${query.toString()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json();
        const incoming = Array.isArray(body.events) ? body.events as GameHubChatEvent[] : [];
        if (!incoming.length || cancelled) return;
        latestId.current = String(body.latestId || incoming.at(-1)?.id || latestId.current);
        setEvents((current) => {
          const merged = new Map(current.map((event) => [event.id, event]));
          for (const event of incoming) merged.set(event.id, event);
          return [...merged.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-250);
        });
      } catch {}
    }

    void pollEvents();
    const timer = window.setInterval(() => void pollEvents(), 1000);
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
      return <div className="grid min-h-72 place-items-center rounded-2xl border border-white/10 bg-black/25 p-8 text-center"><div><div className="text-sm font-bold text-slate-200">{game.name} is STOPPED in #{channel}</div><p className="mt-2 text-xs text-slate-500">Start it from this page or with <code className="text-cyan-100">spmt {commandKey} start</code> before gameplay is accepted.</p></div></div>;
    }
    if (game.id === 'chat-tag') return <ChatTagGame />;
    if (game.id === 'quackverse') return <QuackverseCardGame />;
    if (game.id === 'bingo') return <BingoCard />;
    if (!channel) return <div className="grid min-h-72 place-items-center rounded-2xl border border-white/10 bg-black/25 p-8 text-center text-sm text-slate-400">Open this page while signed in, or add <code className="mx-1 text-cyan-100">?channel=streamer</code>, to attach the live chat surface.</div>;
    return <div className="h-[min(62vh,620px)] min-h-80"><GameHubPrototypeSurface game={game} events={eventsForGame(events, game.id)} channel={channel} /></div>;
  }, [active, channel, commandKey, events, game]);

  return (
    <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-headline text-xl text-white">Play</h2>
          <p className="mt-1 text-xs text-slate-500">Every Games Hub title gets the same gameplay slot. Only joined players feed this game while it is ACTIVE.</p>
        </div>
        {channel && <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${active ? 'bg-emerald-300/10 text-emerald-100' : 'bg-white/8 text-slate-400'}`}>{active ? 'ACTIVE' : active === false ? 'STOPPED' : 'CHECKING'} · #{channel}</span>}
      </div>
      {runtime}
    </section>
  );
}
