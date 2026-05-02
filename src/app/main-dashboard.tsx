
'use client';

import { useMemo, useEffect, useState, useCallback } from 'react';
import type { Player } from '@/lib/types';
import { isAdminUsername } from '@/lib/admin';
import { useSession } from '@/contexts/session-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModActivityLog } from '@/components/mod-activity-log';
import { CommunityList } from '@/components/community-list';
import { Leaderboard } from '@/components/leaderboard';
import { BingoCard } from '@/components/bingo-card';
import { ChatTagGame } from '@/components/chat-tag-game';
import { LiveDiscordMembers } from '@/components/live-discord-members';
import { BotChannelManager } from '@/components/bot-channel-manager';
import { DiscordEmbedPoster } from '@/components/discord-embed-poster';
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
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-2xl font-headline animate-pulse">Loading Astro Clash...</div>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-[320px_1fr] lg:grid-cols-[360px_1fr] gap-6 p-4 md:p-6">
      <aside className="flex flex-col gap-6">
        <CommunityList />
        <Leaderboard players={memoizedPlayers} />
      </aside>

      <div className="min-w-0">
        <Card className="p-4 sm:p-6 bg-card/80 backdrop-blur-sm">
          <Tabs defaultValue="chat-tag" className="w-full">
            <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-6' : 'grid-cols-3'} bg-secondary/50`}>
              <TabsTrigger value="bingo" className="font-headline">Chat Bingo</TabsTrigger>
              <TabsTrigger value="chat-tag" className="font-headline">Chat Tag</TabsTrigger>
              <TabsTrigger value="live-members" className="font-headline">Live Members</TabsTrigger>
              {isAdmin && <TabsTrigger value="mod-log" className="font-headline">Mod Log</TabsTrigger>}
              {isAdmin && <TabsTrigger value="bot" className="font-headline">Bot Channels</TabsTrigger>}
              {isAdmin && <TabsTrigger value="share" className="font-headline">Share</TabsTrigger>}
            </TabsList>
            <TabsContent value="bingo" className="mt-6">
              <BingoCard />
            </TabsContent>
            <TabsContent value="chat-tag" className="mt-6">
              <ChatTagGame players={memoizedPlayers} />
            </TabsContent>
            <TabsContent value="live-members" className="mt-6">
              <LiveDiscordMembers />
            </TabsContent>
            {isAdmin && (
              <TabsContent value="mod-log" className="mt-6">
                <ModActivityLog />
              </TabsContent>
            )}
            {isAdmin && (
              <TabsContent value="bot" className="mt-6">
                <BotChannelManager />
              </TabsContent>
            )}
            {isAdmin && (
              <TabsContent value="share" className="mt-6">
                <DiscordEmbedPoster />
              </TabsContent>
            )}
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
