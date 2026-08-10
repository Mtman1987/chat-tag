'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Gamepad2, Settings, Sparkles, Users } from 'lucide-react';
import type { Player } from '@/lib/types';
import { isClientAdminUsername } from '@/lib/client-admin';
import { useSession } from '@/contexts/session-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModActivityLog } from '@/components/mod-activity-log';
import { CommunityList } from '@/components/community-list';
import { Leaderboard } from '@/components/leaderboard';
import { QuackverseCardGame } from '@/components/quackverse-card-game';
import { ChatTagGame } from '@/components/chat-tag-game';
import { LiveDiscordMembers } from '@/components/live-discord-members';
import { BotChannelManager } from '@/components/bot-channel-manager';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function MainDashboard() {
  const { user, isUserLoading } = useSession();
  const isAdmin = isClientAdminUsername(user?.twitchUsername);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);

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
    fetchPlayers();
    const interval = setInterval(fetchPlayers, 15000);
    return () => clearInterval(interval);
  }, [fetchPlayers]);

  const memoizedPlayers = useMemo(() => players, [players]);
  const activePlayers = useMemo(() => memoizedPlayers.filter((player) => player.isActive).length, [memoizedPlayers]);

  if (isUserLoading || playersLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="animate-pulse font-headline text-2xl">Loading ChatTag...</div>
      </div>
    );
  }

  return (
    <main className="cosmic-page" data-workspace-main>
      <section className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div>
          <div className="cosmic-status">Live game hub</div>
          <h1 className="mt-2 font-headline text-2xl font-bold text-white md:text-3xl">Pick what you want to do.</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">Play ChatTag, check the community, or jump into Quackverse. Admin tools stay out of the way unless you need them.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <div className="min-w-20 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center">
            <div className="font-headline text-lg text-white">{activePlayers}</div>
            <div className="text-slate-500">Live</div>
          </div>
          <div className="min-w-20 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center">
            <div className="font-headline text-lg text-white">{memoizedPlayers.length}</div>
            <div className="text-slate-500">Players</div>
          </div>
        </div>
      </section>

      <Card className="rounded-[1.35rem] border-white/10 bg-white/[0.045] p-3 shadow-[0_24px_80px_rgba(3,8,24,0.3)] backdrop-blur-xl sm:p-5">
        <Tabs defaultValue="play" className="w-full" data-workspace-tabs-root>
          <TabsList className={`grid h-auto w-full gap-1 rounded-xl border border-white/10 bg-slate-950/55 p-1 ${isAdmin ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`} data-workspace-tabs>
            <TabsTrigger value="play" className="gap-2 rounded-lg py-2.5 font-headline"><Gamepad2 className="h-4 w-4" />Play</TabsTrigger>
            <TabsTrigger value="community" className="gap-2 rounded-lg py-2.5 font-headline"><Users className="h-4 w-4" />Community</TabsTrigger>
            <TabsTrigger value="quackverse" className="gap-2 rounded-lg py-2.5 font-headline"><Sparkles className="h-4 w-4" />Quackverse</TabsTrigger>
            {isAdmin && <TabsTrigger value="admin" className="gap-2 rounded-lg py-2.5 font-headline"><Settings className="h-4 w-4" />Admin</TabsTrigger>}
          </TabsList>

          <TabsContent value="play" className="mt-5">
            <ChatTagGame players={memoizedPlayers} adminMode={isAdmin} />
          </TabsContent>

          <TabsContent value="community" className="mt-5 space-y-5">
            <div className="rounded-xl border border-white/10 bg-black/15 p-4">
              <h2 className="font-headline text-lg text-white">Who is here right now?</h2>
              <p className="mt-1 text-sm text-slate-400">Live members first; standings and community details are grouped underneath instead of occupying the game screen.</p>
            </div>
            <LiveDiscordMembers />
            <div className="grid gap-5 xl:grid-cols-2">
              <CommunityList />
              <Leaderboard players={memoizedPlayers} />
            </div>
          </TabsContent>

          <TabsContent value="quackverse" className="mt-5">
            <QuackverseCardGame />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="admin" className="mt-5 space-y-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.05] p-4">
                <div>
                  <h2 className="font-headline text-lg text-white">Admin control center</h2>
                  <p className="mt-1 text-sm text-slate-300">Configuration, repairs, bot cleanup, support tools, and workspace-theme preferences live in one dedicated area.</p>
                </div>
                <Button asChild className="shrink-0"><Link href="/settings"><Settings className="mr-2 h-4 w-4" />Open advanced settings</Link></Button>
              </div>
              <div className="grid gap-5 xl:grid-cols-2">
                <BotChannelManager />
                <ModActivityLog />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </Card>
    </main>
  );
}
