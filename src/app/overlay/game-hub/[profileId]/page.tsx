'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { GAME_HUB_CATALOG, type GameHubGame } from '@/lib/game-hub-registry';
import { GameHubSurface } from '@/components/game-hub-surface';
import type { GameHubChatEvent } from '@/components/game-hub-prototype-surface';
import { nebulaNextRotationDelayMs, nebulaRotationIndexAt } from '@/lib/nebula-rotation';

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

const NEBULA_ACTIVITY_IDLE_MS = 30 * 60_000;
const ALWAYS_VISIBLE_SYSTEM_PROFILES = new Set(['system-spacemountainlive-main', 'system-spacemountainlive-parade']);

function isSpmtCommand(message: string) {
  return /^!?@?spmt(?:\s|$)/i.test(String(message || '').trim());
}

export default function GameHubOverlayPage() {
  const params = useParams<{ profileId: string }>();
  const profileId = String(params?.profileId || '');
  const [profile, setProfile] = useState<PublicOverlayProfile | null>(null);
  const [activeGameIds, setActiveGameIds] = useState<string[]>([]);
  const [suspendedGameIds, setSuspendedGameIds] = useState<string[]>([]);
  const [events, setEvents] = useState<GameHubChatEvent[]>([]);
  const [error, setError] = useState('');
  const [rotationNow, setRotationNow] = useState(() => Date.now());
  const [activityNow, setActivityNow] = useState(() => Date.now());
  const latestChatId = useRef('');
  const latestRuntimeId = useRef('');
  const hasLoadedProfile = useRef(false);
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
          hasLoadedProfile.current = true;
          setProfile(body.profile);
          setError('');
        }
      } catch (nextError: any) {
        // Keep the last known-good stage on transient volume/network errors.
        // System overlays start transparent so a restart never puts an error
        // card over the live media feed while the next poll recovers.
        if (!cancelled && !hasLoadedProfile.current && !profileId.startsWith('system-')) {
          setError(nextError?.message || 'Unable to load overlay profile.');
        }
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
        if (!cancelled) {
          setActiveGameIds(Array.isArray(body.gameIds) ? body.gameIds : []);
          setSuspendedGameIds(Array.isArray(body.suspendedGameIds) ? body.suspendedGameIds : []);
        }
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

  useEffect(() => {
    const timer = window.setInterval(() => setActivityNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const games = useMemo(() => {
    if (!profile) return [];
    const active = new Set(activeGameIds);
    const suspended = new Set(suspendedGameIds);
    // The main Word Chain/Phrase Guess stage is controlled directly by the
    // ACTIVE toggle, so it must appear as soon as a streamer starts a game.
    // Event-style system overlays still release themselves after inactivity.
    const requireRecentPlay = profile.id.startsWith('system-')
      && !ALWAYS_VISIBLE_SYSTEM_PROFILES.has(profile.id);
    const recentlyPlayed = new Set(events.flatMap((event) => {
      const at = Date.parse(event.at);
      if (!Number.isFinite(at) || activityNow - at > NEBULA_ACTIVITY_IDLE_MS) return [];
      return Array.isArray((event as GameHubChatEvent & { gameIds?: string[] }).gameIds)
        ? (event as GameHubChatEvent & { gameIds?: string[] }).gameIds!
        : [];
    }));
    return profile.gameIds
      .filter((gameId) => active.has(gameId) && !suspended.has(gameId) && (!requireRecentPlay || recentlyPlayed.has(gameId) || gameId === 'pixelbattle'))
      .map((gameId) => GAME_HUB_CATALOG.find((game) => game.id === gameId))
      .filter((game): game is GameHubGame => Boolean(game));
  }, [activeGameIds, activityNow, events, profile, suspendedGameIds]);
  const activeGamesKey = games.map((game) => game.id).join(',');

  useEffect(() => {
    if (profileId !== 'system-spacemountainlive-activity') return;
    const gameIds = activeGamesKey ? activeGamesKey.split(',') : [];
    window.parent.postMessage({
      type: 'nebula.activity-state',
      profileId,
      active: gameIds.length > 0,
      gameIds,
    }, '*');
    return () => {
      window.parent.postMessage({ type: 'nebula.activity-state', profileId, active: false, gameIds: [] }, '*');
    };
  }, [activeGamesKey, profileId]);

  useEffect(() => {
    if (profile?.layout !== 'rotation' || games.length < 2) return;
    let timer: number | null = null;
    let cancelled = false;
    const scheduleBoundary = () => {
      if (cancelled) return;
      const now = Date.now();
      setRotationNow(now);
      const delay = nebulaNextRotationDelayMs(now, games.length) || 60_000;
      timer = window.setTimeout(scheduleBoundary, delay + 25);
    };
    scheduleBoundary();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [games.length, profile?.layout]);

  if (error) return <main className="grid min-h-screen place-items-center bg-transparent p-8 text-center text-sm text-rose-200">{error}</main>;
  if (!profile) return <main className="min-h-screen bg-transparent" data-nebula-state="recovering" />;

  const gridClass = profile.layout === 'stack'
    ? 'grid-cols-1 auto-rows-[minmax(260px,1fr)]'
    : profile.layout === 'focus' || profile.layout === 'rotation'
      ? 'grid-cols-1 grid-rows-1'
      : 'grid-cols-[repeat(auto-fit,minmax(min(430px,100%),1fr))] auto-rows-[minmax(300px,1fr)]';
  const rotationIndex = profile.layout === 'rotation'
    ? nebulaRotationIndexAt(rotationNow, games.length)
    : 0;
  const renderedGames = profile.layout === 'focus' ? games.slice(0, 1) : games;
  const systemProfile = profile.id.startsWith('system-');

  return (
    <main className={`min-h-screen w-screen overflow-hidden ${profile.transparent ? 'bg-transparent' : 'bg-slate-950'}`}>
      <div className={`grid h-screen w-screen ${systemProfile ? 'gap-0 p-0' : 'gap-3 p-3'} ${gridClass}`}>
        {renderedGames.map((game, index) => {
          const visible = profile.layout !== 'rotation' || index === rotationIndex;
          if (!visible) return null;
          return (
            <div key={game.id} className={visible ? 'h-full min-h-0 w-full' : 'hidden'} aria-hidden={!visible}>
              <GameHubSurface
                game={game}
                events={events}
                channel={profile.ownerLogin || 'chat'}
                ownerUserId={profile.ownerUserId}
                chrome={!profile.id.startsWith('system-')}
              />
            </div>
          );
        })}
        {!renderedGames.length && !profile.transparent && <div className="grid h-full place-items-center rounded-2xl border border-white/10 bg-slate-950/70 text-sm text-white/50">No games in this profile are currently ACTIVE.</div>}
      </div>
    </main>
  );
}
