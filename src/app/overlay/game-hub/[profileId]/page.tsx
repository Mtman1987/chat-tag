'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { GAME_HUB_CATALOG, type GameHubGame } from '@/lib/game-hub-registry';
import { GameHubSurface } from '@/components/game-hub-surface';
import type { GameHubChatEvent } from '@/components/game-hub-prototype-surface';

type PublicOverlayProfile = {
  id: string;
  name: string;
  ownerUserId: string;
  ownerLogin: string;
  gameIds: string[];
  layout: 'rotation' | 'auto-grid' | 'stack' | 'focus';
  transparent: boolean;
  updatedAt: string;
};

type ProfileResponse = {
  profile: PublicOverlayProfile;
};

type RuntimeAction = {
  id: string;
  at: string;
  channel: string;
  gameId: string;
  username: string;
  displayName: string;
  message: string;
};

function isSpmtCommand(message: string) {
  return /^!?@?spmt(?:\s|$)/i.test(String(message || '').trim());
}

export default function GameHubOverlayPage() {
  const params = useParams<{ profileId: string }>();
  const profileId = String(params?.profileId || '');
  const [profile, setProfile] = useState<PublicOverlayProfile | null>(null);
  const [activeGameIds, setActiveGameIds] = useState<string[]>([]);
  const [events, setEvents] = useState<GameHubChatEvent[]>([]);
  const [error, setError] = useState('');
  const [rotationIndex, setRotationIndex] = useState(0);
  const latestChatId = useRef('');
  const latestRuntimeId = useRef('');
  const ownerLogin = profile?.ownerLogin || '';
  const profileGamesKey = profile?.gameIds.join(',') || '';

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const response = await fetch(`/api/overlay/game-hub/${encodeURIComponent(profileId)}`, { cache: 'no-store' });
        const body = await response.json().catch(() => ({})) as Partial<ProfileResponse> & { error?: string };
        if (!response.ok || !body.profile) throw new Error(body.error || `Overlay returned ${response.status}`);
        if (!cancelled) {
          setProfile(body.profile);
          setError('');
        }
      } catch (nextError: any) {
        if (!cancelled) setError(nextError?.message || 'Unable to load overlay profile.');
      }
    }
    void loadProfile();
    const timer = window.setInterval(() => void loadProfile(), 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [profileId]);

  useEffect(() => {
    if (!ownerLogin) return;
    let cancelled = false;
    async function loadScope() {
      try {
        const response = await fetch(`/api/game-hub/channel?channel=${encodeURIComponent(ownerLogin)}`, { cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) setActiveGameIds(Array.isArray(body.gameIds) ? body.gameIds : []);
      } catch {}
    }
    void loadScope();
    const timer = window.setInterval(() => void loadScope(), 5_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [ownerLogin]);

  useEffect(() => {
    if (!ownerLogin) return;
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
      const query = new URLSearchParams({ channel: ownerLogin });
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
      const query = new URLSearchParams({ channel: ownerLogin, games: profileGamesKey });
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
  }, [ownerLogin, profileGamesKey]);

  const games = useMemo(() => {
    if (!profile) return [];
    const active = new Set(activeGameIds);
    return profile.gameIds
      .filter((gameId) => active.has(gameId))
      .map((gameId) => GAME_HUB_CATALOG.find((game) => game.id === gameId))
      .filter((game): game is GameHubGame => Boolean(game));
  }, [activeGameIds, profile]);

  useEffect(() => {
    if (profile?.layout !== 'rotation' || games.length < 2) return;
    const timer = window.setInterval(() => setRotationIndex((current) => (current + 1) % games.length), 30_000);
    return () => window.clearInterval(timer);
  }, [games.length, profile?.layout]);

  useEffect(() => {
    if (rotationIndex >= games.length) setRotationIndex(0);
  }, [games.length, rotationIndex]);

  if (error) return <main className="grid min-h-screen place-items-center bg-transparent p-8 text-center text-sm text-rose-200">{error}</main>;
  if (!profile) return <main className="min-h-screen bg-transparent" />;

  const gridClass = profile.layout === 'stack'
    ? 'grid-cols-1 auto-rows-[minmax(260px,1fr)]'
    : profile.layout === 'focus' || profile.layout === 'rotation'
      ? 'grid-cols-1 grid-rows-1'
      : 'grid-cols-[repeat(auto-fit,minmax(min(430px,100%),1fr))] auto-rows-[minmax(300px,1fr)]';
  const visibleGames = profile.layout === 'rotation'
    ? (games.length ? [games[rotationIndex % games.length]] : [])
    : profile.layout === 'focus' ? games.slice(0, 1) : games;

  return (
    <main className={`min-h-screen w-screen overflow-hidden ${profile.transparent ? 'bg-transparent' : 'bg-slate-950'}`}>
      <div className={`grid h-screen w-screen gap-3 p-3 ${gridClass}`}>
        {visibleGames.map((game) => (
          <GameHubSurface
            key={game.id}
            game={game}
            events={events}
            channel={profile.ownerLogin || 'chat'}
            ownerUserId={profile.ownerUserId}
          />
        ))}
        {!visibleGames.length && <div className="grid h-full place-items-center rounded-2xl border border-white/10 bg-slate-950/70 text-sm text-white/50">No games in this profile are currently ACTIVE.</div>}
      </div>
    </main>
  );
}
