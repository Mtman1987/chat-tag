'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

interface BotChannel {
  id: string;
  username: string;
  isActive: boolean;
}

export function BotChannelManager() {
  const [channels, setChannels] = useState<BotChannel[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAutoJoining, setIsAutoJoining] = useState(false);
  const { toast } = useToast();

  const fetchChannels = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/bot/channels');
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
      }
    } catch (error) {
      console.error('Failed to fetch bot channels:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAutoJoin = async () => {
    setIsAutoJoining(true);
    try {
      const liveRes = await fetch('/api/discord/live-members');
      if (liveRes.ok) {
        const liveData = await liveRes.json();
        const liveUsernames = liveData.liveMembers?.map((m: any) => m.twitchUsername).filter(Boolean) || [];
        
        const joinRes = await fetch('/api/bot/auto-join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ liveUsernames })
        });
        
        if (joinRes.ok) {
          toast({ title: 'Auto-join complete', description: `Joined ${liveUsernames.length} live channels` });
          await fetchChannels();
        }
      }
    } catch (error) {
      console.error('Auto-join failed:', error);
      toast({ variant: 'destructive', title: 'Auto-join failed', description: 'Failed to join live channels' });
    } finally {
      setIsAutoJoining(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          <CardTitle className="font-headline">Bot Channels</CardTitle>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleAutoJoin} disabled={isAutoJoining} size="sm" variant="default">
            <Plus className={`mr-2 h-4 w-4 ${isAutoJoining ? 'animate-spin' : ''}`} />
            {isAutoJoining ? 'Joining...' : 'Auto-Join Live'}
          </Button>
          <Button onClick={fetchChannels} disabled={isRefreshing} size="sm" variant="ghost">
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-2">
            {channels.map((channel) => (
              <div key={channel.id} className="flex items-center justify-between gap-3 p-3 rounded-md border bg-card/50">
                <div className="flex items-center gap-3">
                  <Badge variant={channel.isActive ? 'default' : 'secondary'} className="font-mono">
                    #{channel.username}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {channel.isActive ? 'Live' : 'Offline'}
                  </span>
                </div>
              </div>
            ))}
            {channels.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No channels available</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
