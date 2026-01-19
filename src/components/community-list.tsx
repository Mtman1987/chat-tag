
'use client';

import type { Player } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Users, MessageSquare, RefreshCw } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Button } from './ui/button';
import Link from 'next/link';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { GameSettings } from '@/lib/types';

interface CommunityListProps {
  players: Player[];
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
      ></iframe>
    </div>
  );
};


export function CommunityList({ players }: CommunityListProps) {
  const liveStreamers = players.filter((p) => p.isActive);
  const offlinePlayers = players.filter((p) => !p.isActive);
  
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();
  
  const settingsDocRef = useMemoFirebase(
    () => (firestore ? doc(firestore, "gameSettings", "default") : null),
    [firestore]
  );
  const { data: settings } = useDoc<GameSettings>(settingsDocRef);


  const handleSync = async () => {
    if (!settings?.externalApiUrl) {
      toast({
        variant: "destructive",
        title: "Sync Skipped",
        description: "External API URL is not configured in settings.",
      });
      return;
    }
    setIsSyncing(true);
    toast({
      title: "Refreshing community...",
      description: "Fetching the latest live status.",
    });

    try {
      const response = await fetch('/api/sync-community', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ externalApiUrl: settings.externalApiUrl }),
      });
      
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch community data.');
      }
      
      toast({
        title: "List Refreshed!",
        description: result.message || "Successfully synchronized players.",
      });

    } catch (error: any) {
       toast({
        variant: "destructive",
        title: "Sync Failed",
        description: error.message || "Could not sync community data.",
      });
    } finally {
      setIsSyncing(false);
    }
  }

  // Trigger sync on initial component load if the URL is present
  useEffect(() => {
    if (settings?.externalApiUrl) {
      handleSync();
    }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.externalApiUrl]);

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            <CardTitle className="font-headline">Community ({players.length})</CardTitle>
        </div>
        <Button onClick={handleSync} disabled={isSyncing} size="sm" variant="ghost">
          <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" defaultValue={['live-now']} className="w-full">
          <AccordionItem value="live-now">
            <AccordionTrigger className="font-semibold">Live Now ({liveStreamers.length})</AccordionTrigger>
            <AccordionContent>
              <ScrollArea className="h-48">
                <div className="space-y-1 pr-4">
                  {liveStreamers.map((player) => (
                    <Popover key={player.id}>
                      <div className="flex items-center justify-between gap-3 p-2 rounded-md transition-colors hover:bg-accent/50">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative">
                            <Avatar>
                              <AvatarImage src={player.avatarUrl} alt={player.twitchUsername} />
                              <AvatarFallback>{player.twitchUsername.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-green-500 ring-2 ring-card" />
                          </div>
                          <Link href={`https://www.twitch.tv/${player.twitchUsername}`} target="_blank" rel="noopener noreferrer" className="font-medium truncate hover:underline">
                            {player.twitchUsername}
                          </Link>
                        </div>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 px-2 flex-shrink-0">
                            <MessageSquare className="h-4 w-4 mr-1"/> Chat
                          </Button>
                        </PopoverTrigger>
                      </div>
                      <PopoverContent>
                        <TwitchChatEmbed username={player.twitchUsername} />
                      </PopoverContent>
                    </Popover>
                  ))}
                  {liveStreamers.length === 0 && <p className="text-muted-foreground text-sm p-2">No one is live right now.</p>}
                </div>
              </ScrollArea>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="offline">
            <AccordionTrigger className="font-semibold">Offline ({offlinePlayers.length})</AccordionTrigger>
            <AccordionContent>
                <ScrollArea className="h-48">
                  <div className="space-y-1 pr-4">
                    {offlinePlayers.map((player) => (
                      <div key={player.id} className="flex items-center gap-3 opacity-60 p-2">
                        <div className="relative">
                          <Avatar>
                            <AvatarImage src={player.avatarUrl} alt={player.twitchUsername} />
                            <AvatarFallback>{player.twitchUsername.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-gray-500 ring-2 ring-card" />
                        </div>
                        <span className="font-medium truncate">{player.twitchUsername}</span>
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
