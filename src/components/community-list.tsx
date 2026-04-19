'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Users, MessageSquare, RefreshCw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useLiveStreamers } from '@/contexts/live-streamers-context';
import type { Player as FirestorePlayer } from '@/lib/types';

interface CommunityMember {
  id: string;
  twitchUsername?: string;
  username?: string;
  avatarUrl?: string;
  avatar?: string;
  isActive: boolean;
  isSharedChat?: boolean;
  sharedWith?: string[];
}

interface CommunityListProps {
  players?: FirestorePlayer[];
}

const TwitchChatEmbed = ({ username }: { username: string }) => {
  const parentDomain = typeof window !== 'undefined' ? window.location.hostname : '';
  const src = `https://www.twitch.tv/embed/${username}/chat?parent=${parentDomain}&darkpopout`;

  return (
    <div className="h-96 w-80">
      <iframe
        src={src}
        height="100%"
        width="100%"
        className="rounded-md border"
        title={`Twitch chat for ${username}`}
      ></iframe>
    </div>
  );
};

export function CommunityList({ players = [] }: CommunityListProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [tagStatusByUser, setTagStatusByUser] = useState<Record<string, { isIt: boolean; away: boolean }>>({});
  const { toast } = useToast();
  const { allCommunityMembers, liveStreamers, refreshStreamers, isLoading } = useLiveStreamers();

  const fetchTagStatus = async () => {
    try {
      const res = await fetch('/api/tag', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const map: Record<string, { isIt: boolean; away: boolean }> = {};
      for (const p of data.players || []) {
        const key = String(p.twitchUsername || p.username || '').toLowerCase();
        if (!key) continue;
        map[key] = {
          isIt: Boolean(p.isIt),
          away: Boolean(p.offlineImmunity || p.sleepingImmunity),
        };
      }
      setTagStatusByUser(map);
    } catch {}
  };

  // Use shared data or fallback to props
  const fallbackPlayers: CommunityMember[] =
    players.length > 0
      ? players.map((player) => ({
          id: player.id,
          twitchUsername: player.twitchUsername,
          avatarUrl: player.avatarUrl,
          isActive: player.isActive,
        }))
      : [];
  const communityPlayers: CommunityMember[] =
    allCommunityMembers.length > 0 ? allCommunityMembers : fallbackPlayers;

  const getDisplayName = (player: CommunityMember) => player.twitchUsername || player.username || player.id;
  const getAvatar = (player: CommunityMember) =>
    player.avatarUrl || player.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(getDisplayName(player))}&background=random`;

  const liveStreamersData = communityPlayers
    .filter((p) => p.isActive && getDisplayName(p))
    .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
  const offlinePlayers = communityPlayers
    .filter((p) => !p.isActive && getDisplayName(p))
    .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));

  const handleSync = async () => {
    setIsSyncing(true);
    toast({
      title: "Refreshing community...",
      description: "Fetching the latest live status.",
    });

    try {
      await refreshStreamers();
      await fetchTagStatus();
      
      toast({
        title: "List Refreshed!",
        description: "Successfully synchronized players.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Sync Failed",
        description: "Could not sync community data.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchTagStatus();
    const interval = setInterval(fetchTagStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          <CardTitle className="font-headline">Community ({communityPlayers.length})</CardTitle>
        </div>
        <Button onClick={handleSync} disabled={isSyncing} size="sm" variant="ghost">
          <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" defaultValue={['live-now']} className="w-full">
          <AccordionItem value="live-now">
            <AccordionTrigger className="font-semibold">Live Now ({liveStreamersData.length})</AccordionTrigger>
            <AccordionContent>
              <ScrollArea className="h-[28rem]">
                <div className="space-y-1 pr-4">
                  {liveStreamersData.map((player) => (
                    <div key={player.id} className="flex items-center justify-between gap-3 p-2 rounded-md transition-colors hover:bg-accent/50">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={getAvatar(player)} alt={getDisplayName(player)} />
                            <AvatarFallback>{getDisplayName(player).charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-card animate-pulse" />
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          <Link href={`https://www.twitch.tv/${getDisplayName(player)}`} target="_blank" rel="noopener noreferrer" className="font-medium truncate hover:underline">
                            {getDisplayName(player)}
                          </Link>
                          {tagStatusByUser[getDisplayName(player).toLowerCase()]?.isIt && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-red-500 text-red-500">IT</span>
                          )}
                          {tagStatusByUser[getDisplayName(player).toLowerCase()]?.away && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-cyan-500 text-cyan-500">AWAY</span>
                          )}
                          {player.isSharedChat && (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-500 text-amber-500"
                              title={`Shared with: ${(player.sharedWith || []).join(', ') || 'unknown'}`}
                            >
                              SHARED
                            </span>
                          )}
                        </div>
                      </div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MessageSquare className="h-4 w-4"/>
                            <span className="sr-only">Chat</span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent side="right" align="start" className="w-auto p-0 border-none">
                          <TwitchChatEmbed username={getDisplayName(player)} />
                        </PopoverContent>
                      </Popover>
                    </div>
                  ))}
                  {liveStreamersData.length === 0 && <p className="text-muted-foreground text-sm p-2">No one is live right now.</p>}
                </div>
              </ScrollArea>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="offline">
            <AccordionTrigger className="font-semibold">Community ({offlinePlayers.length})</AccordionTrigger>
            <AccordionContent>
              <ScrollArea className="h-48">
                <div className="space-y-1 pr-4">
                  {offlinePlayers.map((player) => (
                    <div key={player.id} className="flex items-center gap-3 opacity-60 p-2">
                      <div className="relative">
                        <Avatar>
                          <AvatarImage src={getAvatar(player)} alt={getDisplayName(player)} />
                          <AvatarFallback>{getDisplayName(player).charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-gray-500 ring-2 ring-card" />
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{getDisplayName(player)}</span>
                        {tagStatusByUser[getDisplayName(player).toLowerCase()]?.isIt && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-red-500 text-red-500">IT</span>
                        )}
                        {tagStatusByUser[getDisplayName(player).toLowerCase()]?.away && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-cyan-500 text-cyan-500">AWAY</span>
                        )}
                        {player.isSharedChat && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-500 text-amber-500"
                            title={`Shared with: ${(player.sharedWith || []).join(', ') || 'unknown'}`}
                          >
                            SHARED
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {offlinePlayers.length === 0 && <p className="text-muted-foreground text-sm p-2">Everyone is online!</p>}
                </div>
              </ScrollArea>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
