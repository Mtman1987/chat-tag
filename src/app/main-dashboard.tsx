'use client';

import { useMemo, useEffect, useState, useCallback } from 'react';
import type { Player } from '@/lib/types';
import { isAdminUsername } from '@/lib/admin';
import { useSession } from '@/contexts/session-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModActivityLog } from '@/components/mod-activity-log';
import { CommunityList } from '@/components/community-list';
import { Leaderboard } from '@/components/leaderboard';
import { QuackverseCardGame } from '@/components/quackverse-card-game';
import { ChatTagGame } from '@/components/chat-tag-game';
import { LiveDiscordMembers } from '@/components/live-discord-members';
import { BotChannelManager } from '@/components/bot-channel-manager';
import { Card } from '@/components/ui/card';

export function MainDashboard() {
  const { user, isUserLoading } = useSession();
  const isAdmin = isAdminUsername(user?.twitchUsername);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);

  const fetchPlayers = useCallback(async () => {
    try {
      const res = await fetch('/api/tag', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const mapped: Player[] = (data.players || []).map((p: any) => ({
          id: p.id,
          twitchUsername: p.twitchUsername || p.username || p.id,
          avatarUrl: p.avatarUrl || p.avatar || '',
          score: p.score || 0,
          communityPoints: p.communityPoints || 0,
          isIt: Boolean(p.isIt),
          isActive: Boolean(p.isActive),
        }));
        setPlayers(mapped);
      }
    } catch (e) {
      console.error('Failed to fetch players:', e);
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

  if (isUserLoading || playersLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-2xl font-headline animate-pulse">Loading Astro Clash...</div>
      </div>
    );
  }

  return (
    <main className="cosmic-page">
      <section className="cosmic-hero">
        <div className="cosmic-card space-y-4">
          <div className="cosmic-status">Production Layout</div>
          <h1 className="cosmic-title">Home</h1>
          <p className="cosmic-subtitle">
            Creator overlays, tags, commands, live community tracking, and Quackverse controls now sit inside the same production shell. The data below is still the real app state, not placeholder markup.
          </p>
          <div className="cosmic-note">
            The app-suite HTML acted as the visual brief. This page keeps the current React tabs, APIs, and mod tools while adopting that shell instead of replacing the working app.
          </div>
        </div>

        <div className="cosmic-panel">
          <h2 className="mb-4 font-headline text-2xl text-white">Live Preview</h2>
          <div className="mock-window">
            <div className="mock-head">
              <span className="mock-dot mock-dot-red" />
              <span className="mock-dot mock-dot-amber" />
              <span className="mock-dot mock-dot-green" />
            </div>
            <div className="mock-body">
              <div className="mock-row"><span>App</span><span>Chat-Tag</span></div>
              <div className="mock-row"><span>Players</span><span>{memoizedPlayers.length}</span></div>
              <div className="mock-row"><span>Views</span><span>{isAdmin ? '4 active tabs' : '3 active tabs'}</span></div>
              <div className="mock-row"><span>Status</span><span>{isAdmin ? 'Admin ready' : 'Player ready'}</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="cosmic-grid">
        <div className="cosmic-tile">
          <div className="cosmic-kpi">01</div>
          <h3 className="mb-2 font-headline text-xl text-white">Main Module</h3>
          <p className="text-sm text-slate-300">Chat Tag and Quackverse remain the primary interactive surfaces.</p>
        </div>
        <div className="cosmic-tile">
          <div className="cosmic-kpi">02</div>
          <h3 className="mb-2 font-headline text-xl text-white">Realtime Data</h3>
          <p className="text-sm text-slate-300">Live status, leaderboard updates, and player state still refresh from the current APIs.</p>
        </div>
        <div className="cosmic-tile">
          <div className="cosmic-kpi">03</div>
          <h3 className="mb-2 font-headline text-xl text-white">OBS Integration</h3>
          <p className="text-sm text-slate-300">Overlay, broadcast, and bot tooling keep the same routes while matching the new shell.</p>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-6">
          <CommunityList />
          <Leaderboard players={memoizedPlayers} />
        </aside>

        <div className="min-w-0">
          <Card className="rounded-[1.5rem] border-white/10 bg-white/[0.05] p-4 shadow-[0_24px_80px_rgba(3,8,24,0.35)] backdrop-blur-xl sm:p-6">
            <Tabs defaultValue="quackverse" className="w-full">
              <TabsList className={`grid w-full rounded-full border border-white/10 bg-slate-950/55 p-1 ${isAdmin ? 'grid-cols-4' : 'grid-cols-3'}`}>
                <TabsTrigger value="quackverse" className="rounded-full font-headline">Quackverse</TabsTrigger>
                <TabsTrigger value="chat-tag" className="rounded-full font-headline">Chat Tag</TabsTrigger>
                <TabsTrigger value="live-members" className="rounded-full font-headline">Live Members</TabsTrigger>
                {isAdmin && <TabsTrigger value="mod" className="rounded-full font-headline">Mod</TabsTrigger>}
              </TabsList>
              <TabsContent value="quackverse" className="mt-6">
                <QuackverseCardGame />
              </TabsContent>
              <TabsContent value="chat-tag" className="mt-6">
                <ChatTagGame players={memoizedPlayers} />
              </TabsContent>
              <TabsContent value="live-members" className="mt-6">
                <LiveDiscordMembers />
              </TabsContent>
              {isAdmin && (
                <TabsContent value="mod" className="mt-6 space-y-6">
                  <ChatTagGame players={memoizedPlayers} adminMode />
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
