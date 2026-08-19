'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { GAME_HUB_CATALOG, type GameHubGame } from '@/lib/game-hub-catalog';
import { GameHubPrototypeSurface, type GameHubChatEvent } from '@/components/game-hub-prototype-surface';

type PublicOverlayProfile = {
  id: string;
  name: string;
  ownerUserId: string;
  ownerLogin: string;
  gameIds: string[];
  layout: 'auto-grid' | 'stack' | 'focus';
  transparent: boolean;
  updatedAt: string;
};

type ProfileResponse = {
  profile: PublicOverlayProfile;
};

function tagOverlayUserId(ownerUserId: string) {
  const value = String(ownerUserId || '').trim();
  return value.startsWith('user_') ? value : `user_${value}`;
}

export default function GameHubOverlayPage() {
  const params = useParams<{ profileId: string }>();
  const profileId = String(params?.profileId || '');
  const [profile, setProfile] = useState<PublicOverlayProfile | null>(null);
  const [events, setEvents] = useState<GameHubChatEvent[]>([]);
  const [error, setError] = useState('');
  const latestId = useRef('');

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
    if (!profile?.ownerLogin) return;
    let cancelled = false;
    latestId.current = '';
    setEvents([]);

    async function poll() {
      const query = new URLSearchParams({ channel: profile!.ownerLogin });
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
      } catch {
        // Overlay polling is intentionally quiet. The next tick retries.
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [profile?.ownerLogin]);

  const games = useMemo(() => {
    if (!profile) return [];
    return profile.gameIds
      .map((gameId) => GAME_HUB_CATALOG.find((game) => game.id === gameId))
      .filter((game): game is GameHubGame => Boolean(game));
  }, [profile]);

  if (error) return <main className="grid min-h-screen place-items-center bg-transparent p-8 text-center text-sm text-rose-200">{error}</main>;
  if (!profile) return <main className="min-h-screen bg-transparent" />;

  const gridClass = profile.layout === 'stack'
    ? 'grid-cols-1 auto-rows-[minmax(260px,1fr)]'
    : profile.layout === 'focus'
      ? 'grid-cols-1 grid-rows-1'
      : 'grid-cols-[repeat(auto-fit,minmax(min(430px,100%),1fr))] auto-rows-[minmax(300px,1fr)]';
  const visibleGames = profile.layout === 'focus' ? games.slice(0, 1) : games;

  return (
    <main className={`min-h-screen w-screen overflow-hidden ${profile.transparent ? 'bg-transparent' : 'bg-slate-950'}`}>
      <div className={`grid h-screen w-screen gap-3 p-3 ${gridClass}`}>
        {visibleGames.map((game) => {
          if (game.id === 'chat-tag') {
            const source = `/overlay/${encodeURIComponent(tagOverlayUserId(profile.ownerUserId))}?cycle=420&hudOn=45&hudOff=120`;
            return <div key={game.id} className="min-h-0 overflow-hidden rounded-2xl"><iframe src={source} title="Chat Tag game overlay" className="h-full w-full border-0 bg-transparent" /></div>;
          }
          if (game.id === 'quackverse') {
            const query = profile.ownerLogin ? `?tenant=${encodeURIComponent(profile.ownerLogin)}` : '';
            return <div key={game.id} className="min-h-0 overflow-hidden rounded-2xl"><iframe src={`/quackverse-overlay${query}`} title="Quackverse game overlay" className="h-full w-full border-0 bg-transparent" /></div>;
          }
          return <GameHubPrototypeSurface key={game.id} game={game} events={events} channel={profile.ownerLogin || 'chat'} />;
        })}
        {!visibleGames.length && <div className="grid h-full place-items-center rounded-2xl border border-white/10 bg-slate-950/70 text-sm text-white/50">No games enabled in this overlay.</div>}
      </div>
    </main>
  );
}
