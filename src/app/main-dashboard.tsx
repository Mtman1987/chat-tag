'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gamepad2, Radio, Sparkles, Users } from 'lucide-react';
import type { Player } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CommunityList } from '@/components/community-list';
import { Leaderboard } from '@/components/leaderboard';
import { QuackverseCardGame } from '@/components/quackverse-card-game';
import { ChatTagGame } from '@/components/chat-tag-game';
import { useLiveStreamers } from '@/contexts/live-streamers-context';

export function MainDashboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const { liveStreamers, allCommunityMembers, isLoading: liveLoading } = useLiveStreamers();

  const fetchPlayers = useCallback(async () => {
    try {
      const res = await fetch('/api/tag', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const mapped: Player[] = (data.players || []).map((player: any) => ({
          id: player.id,
          twitchUsername: player.twitchUsername || player.username || player.id,
          avatarUrl: player.avatarUrl || player.avatar || '',
          score: player.score || 0,
          communityPoints: player.communityPoints || 0,
          isIt: Boolean(player.isIt),
          isActive: Boolean(player.isActive),
        }));
        setPlayers(mapped);
      }
    } catch (error) {
      console.error('Failed to fetch players:', error);
    } finally {
      setPlayersLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPlayers();
    const interval = window.setInterval(() => void fetchPlayers(), 15_000);
    return () => window.clearInterval(interval);
  }, [fetchPlayers]);

  const memoizedPlayers = useMemo(() => players, [players]);
  const communityCount = allCommunityMembers.length || memoizedPlayers.length;

  if (playersLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="animate-pulse font-headline text-2xl">Loading ChatTag...</div>
      </div>
    );
  }

  return (
    <main className="cosmic-page" data-workspace-main>
      <section className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="cosmic-status"><Radio className="h-3.5 w-3.5" /> Community game hub</div>
          <h1 className="mt-3 font-headline text-3xl font-bold tracking-tight text-white md:text-4xl">Tag the community. Jump into Quackverse.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">The game stays front and center. Live community status lives in the sidebar, and owner controls stay behind the authenticated settings route.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs sm:flex">
          <div className="min-w-24 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] px-4 py-2.5 text-center backdrop-blur">
            <div className="font-headline text-xl text-emerald-200">{liveLoading ? '—' : liveStreamers.length}</div>
            <div className="text-slate-500">Live</div>
          </div>
          <div className="min-w-24 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-center backdrop-blur">
            <div className="font-headline text-xl text-white">{communityCount}</div>
            <div className="text-slate-500">Community</div>
          </div>
          <div className="min-w-24 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-center backdrop-blur">
            <div className="font-headline text-xl text-white">{memoizedPlayers.length}</div>
            <div className="text-slate-500">Players</div>
          </div>
        </div>
      </section>

      <Tabs defaultValue="play" className="w-full" data-workspace-tabs-root>
        <TabsList className="grid h-auto w-full max-w-3xl grid-cols-3 gap-1 rounded-xl border border-white/10 bg-slate-950/65 p-1 shadow-sm backdrop-blur-xl" data-workspace-tabs>
          <TabsTrigger value="play" className="gap-2 rounded-lg py-2.5 font-headline"><Gamepad2 className="h-4 w-4" />Play</TabsTrigger>
          <TabsTrigger value="community" className="gap-2 rounded-lg py-2.5 font-headline"><Users className="h-4 w-4" />Community</TabsTrigger>
          <TabsTrigger value="quackverse" className="gap-2 rounded-lg py-2.5 font-headline"><Sparkles className="h-4 w-4" />Quackverse</TabsTrigger>
        </TabsList>

        <TabsContent value="play" className="mt-4">
          <ChatTagGame players={memoizedPlayers} />
        </TabsContent>

        <TabsContent value="community" className="mt-4">
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
            <CommunityList players={memoizedPlayers} />
            <Leaderboard players={memoizedPlayers} />
          </div>
        </TabsContent>

        <TabsContent value="quackverse" className="mt-4">
          <QuackverseCardGame />
        </TabsContent>
      </Tabs>
    </main>
  );
}
