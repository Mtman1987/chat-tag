'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Settings } from 'lucide-react';
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
  const activePlayers = useMemo(
    () => memoizedPlayers.filter((player) => player.isActive).length,
    [memoizedPlayers],
  );

  if (isUserLoading || playersLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse font-headline text-2xl">Loading Chat-Tag...</div>
      </div>
    );
  }

  return (
    <main className="cosmic-page" data-workspace-main>
      <section className="flex flex-col gap-4 rounded-[1.25rem] border border-white/10 bg-white/[0.05] p-4 shadow-[0_18px_60px_rgba(3,8,24,0.28)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="cosmic-status">Live workspace</div>
          <h1 className="mt-2 font-headline text-2xl font-bold text-white md:text-3xl">Chat-Tag Control Room</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-300">
            Pick one section below. Quackverse controls, Chat-Tag, live members, and admin tools no longer compete with duplicate page tabs.
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 text-center text-xs sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-2">
            <div className="font-headline text-xl text-white">{memoizedPlayers.length}</div>
            <div className="text-slate-400">Players</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-2">
            <div className="font-headline text-xl text-white">{activePlayers}</div>
            <div className="text-slate-400">Active</div>
          </div>
          <div className="col-span-2 rounded-xl border border-white/10 bg-black/20 px-4 py-2 sm:col-span-1">
            <div className="font-headline text-xl text-white">{isAdmin ? 'Admin' : 'Player'}</div>
            <div className="text-slate-400">Access</div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-6">
          <CommunityList />
          <Leaderboard players={memoizedPlayers} />
        </aside>

        <div className="min-w-0">
          <Card className="rounded-[1.5rem] border-white/10 bg-white/[0.05] p-4 shadow-[0_24px_80px_rgba(3,8,24,0.35)] backdrop-blur-xl sm:p-6">
            <Tabs defaultValue="chat-tag" className="w-full" data-workspace-tabs-root>
              <TabsList
                className={`grid h-auto w-full gap-1 rounded-2xl border border-white/10 bg-slate-950/55 p-1 ${isAdmin ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}
                data-workspace-tabs
              >
                <TabsTrigger value="chat-tag" className="rounded-xl font-headline">Chat Tag</TabsTrigger>
                <TabsTrigger value="live-members" className="rounded-xl font-headline">Live Members</TabsTrigger>
                <TabsTrigger value="quackverse" className="rounded-xl font-headline">Quackverse</TabsTrigger>
                {isAdmin && <TabsTrigger value="admin" className="rounded-xl font-headline">Admin</TabsTrigger>}
              </TabsList>

              <TabsContent value="chat-tag" className="mt-6">
                <ChatTagGame players={memoizedPlayers} adminMode={isAdmin} />
              </TabsContent>
              <TabsContent value="live-members" className="mt-6">
                <LiveDiscordMembers />
              </TabsContent>
              <TabsContent value="quackverse" className="mt-6">
                <QuackverseCardGame />
              </TabsContent>
              {isAdmin && (
                <TabsContent value="admin" className="mt-6 space-y-6">
                  <div className="flex flex-col gap-3 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="font-headline text-lg text-white">Settings, repairs, and cleanup</h2>
                      <p className="text-sm text-slate-300">
                        Clear away status, repair player avatars, merge duplicate players, prune channels, and control SpaceMountain theme syncing.
                      </p>
                    </div>
                    <Button asChild className="shrink-0">
                      <Link href="/settings">
                        <Settings className="mr-2 h-4 w-4" /> Open Settings
                      </Link>
                    </Button>
                  </div>
                  <BotChannelManager />
                  <ModActivityLog />
                </TabsContent>
              )}
            </Tabs>
          </Card>
        </div>
      </section>
    </main>
  );
}
