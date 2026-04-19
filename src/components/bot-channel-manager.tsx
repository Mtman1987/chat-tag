'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, X, RefreshCw, Play, Pause, Square, MessageSquare, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

interface BotChannel {
  name: string;
  joined: boolean;
  status: 'pending' | 'joining' | 'joined' | 'failed';
}

interface BotCommand {
  name: string;
  description: string;
  enabled: boolean;
}

export function BotChannelManager() {
  const [channels, setChannels] = useState<BotChannel[]>([]);
  const [pendingChannels, setPendingChannels] = useState<string[]>([]);
  const [blacklistedChannels, setBlacklistedChannels] = useState<string[]>([]);
  const [newBlacklistChannel, setNewBlacklistChannel] = useState('');
  const [newChannel, setNewChannel] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isJoiningAll, setIsJoiningAll] = useState(false);
  const [joinProgress, setJoinProgress] = useState({ current: 0, total: 0 });
  const [commands, setCommands] = useState<BotCommand[]>([]);
  const [newCommandName, setNewCommandName] = useState('');
  const [newCommandDescription, setNewCommandDescription] = useState('');
  const [isAddingCommand, setIsAddingCommand] = useState(false);
  const { toast } = useToast();

  const fetchChannels = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/bot/channels');
      if (res.ok) {
        const data = await res.json();
        const parsedChannels = data.channels.map((channel: { name: string; status: string }) => ({
          name: channel.name,
          joined: channel.status === 'joined',
          status: channel.status as 'joined' | 'failed' | 'pending'
        }));
        // Sort: joined first, then pending/failed
        parsedChannels.sort((a: BotChannel, b: BotChannel) => {
          if (a.joined && !b.joined) return -1;
          if (!a.joined && b.joined) return 1;
          return 0;
        });
        setChannels(parsedChannels);
      }

      // Also fetch pending channels
      const pendingRes = await fetch('/api/bot/channels/pending');
      if (pendingRes.ok) {
        const pendingData = await pendingRes.json();
        setPendingChannels(pendingData.channels || []);
      }
    } catch (error) {
      console.error('Failed to fetch bot channels:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchCommands = async () => {
    try {
      const res = await fetch('/api/bot/commands');
      if (res.ok) {
        const data = await res.json();
        setCommands(data.commands || []);
      }
    } catch (error) {
      console.error('Failed to fetch bot commands:', error);
    }
  };

  const fetchBlacklist = async () => {
    try {
      const res = await fetch('/api/bot/blacklist');
      if (res.ok) {
        const data = await res.json();
        setBlacklistedChannels((data.blacklisted || []).sort());
      }
    } catch (error) {
      console.error('Failed to fetch blacklist:', error);
    }
  };

  useEffect(() => {
    fetchChannels();
    fetchCommands();
    fetchBlacklist();
    const interval = setInterval(fetchChannels, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleAddChannel = async () => {
    if (!newChannel.trim()) return;

    const channelName = newChannel.trim().toLowerCase();
    
    // Check if already in list
    if (allChannels.find(c => c.name === channelName)) {
      toast({
        variant: "destructive",
        title: "Already in List",
        description: `#${channelName} is already in the channel list`,
      });
      return;
    }

    setIsLoading(true);
    try {
      // Add AND join immediately
      const res = await fetch('/api/bot/channels/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelName }),
      });

      if (res.ok) {
        setNewChannel('');
        await fetchChannels();
        toast({
          title: "Channel Added & Joined",
          description: `Successfully added and joined #${channelName}`,
        });
      } else {
        const error = await res.text();
        toast({
          variant: "destructive",
          title: "Failed",
          description: error || "Failed to add and join channel",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: "Network error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinSingleChannel = async (channelName: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/bot/channels/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelName }),
      });

      if (res.ok) {
        await fetchChannels();
        toast({
          title: "Channel Joined",
          description: `Successfully joined #${channelName}`,
        });
      } else {
        const error = await res.text();
        toast({
          variant: "destructive",
          title: "Join Failed",
          description: error || "Failed to join channel",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Join Failed",
        description: "Network error while joining channel",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinAllChannels = async () => {
    if (pendingChannels.length === 0) {
      toast({
        title: "No Pending Channels",
        description: "All available channels have been joined or there are no channels to join.",
      });
      return;
    }

    setIsJoiningAll(true);
    setJoinProgress({ current: 0, total: pendingChannels.length });

    try {
      const res = await fetch('/api/bot/channels/join-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: pendingChannels }),
      });

      if (res.ok) {
        toast({
          title: "Join Process Started",
          description: `Starting to join ${pendingChannels.length} channels in the background.`,
        });
        // Refresh after a delay to show progress
        setTimeout(fetchChannels, 5000);
      } else {
        const error = await res.text();
        console.error('[BotChannelManager] Join all failed:', res.status, error);
        toast({
          variant: "destructive",
          title: "Join Failed",
          description: `Failed to start joining channels (${res.status}): ${error.substring(0, 100)}${error.length > 100 ? '...' : ''}`,
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Join Failed",
        description: "Network error while starting join process",
      });
    } finally {
      setIsJoiningAll(false);
    }
  };

  const handleStopJoining = async () => {
    try {
      const res = await fetch('/api/bot/channels/stop-joining', {
        method: 'POST',
      });

      if (res.ok) {
        toast({
          title: "Join Process Stopped",
          description: "Background channel joining has been stopped.",
        });
        setIsJoiningAll(false);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Stop Failed",
        description: "Failed to stop the join process",
      });
    }
  };

  const handleLeaveChannel = async (channelName: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/bot/channels/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelName }),
      });

      if (res.ok) {
        await fetchChannels();
        console.log(`[BotChannelManager] Successfully left: ${channelName}`);
        toast({
          title: "Left Chat",
          description: `Left #${channelName} chat (still in list)`,
        });
      } else {
        const error = await res.text();
        console.error(`[BotChannelManager] Leave failed (${res.status}):`, error);
        toast({
          variant: "destructive",
          title: "Leave Failed",
          description: error || "Failed to leave channel",
        });
      }
    } catch (error) {
      console.error('[BotChannelManager] Leave error:', error);
      toast({
        variant: "destructive",
        title: "Leave Failed",
        description: "Network error while leaving channel",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveChannel = async (channelName: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/bot/channels/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelName }),
      });

      if (res.ok) {
        await fetchChannels();
        console.log(`[BotChannelManager] Successfully removed: ${channelName}`);
        toast({
          title: "Removed",
          description: `Removed #${channelName} from list`,
        });
      } else {
        const error = await res.text();
        console.error(`[BotChannelManager] Remove failed (${res.status}):`, error);
        toast({
          variant: "destructive",
          title: "Remove Failed",
          description: error || "Failed to remove channel",
        });
      }
    } catch (error) {
      console.error('[BotChannelManager] Remove error:', error);
      toast({
        variant: "destructive",
        title: "Remove Failed",
        description: "Network error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCommand = async () => {
    if (!newCommandName.trim()) return;

    setIsAddingCommand(true);
    try {
      const res = await fetch('/api/bot/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCommandName.trim(),
          description: newCommandDescription.trim() || undefined
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCommands(prev => [...prev, data.command]);
        setNewCommandName('');
        setNewCommandDescription('');
        toast({
          title: "Command Added",
          description: `Successfully added command "${data.command.name}"`,
        });
      } else {
        const error = await res.text();
        toast({
          variant: "destructive",
          title: "Add Failed",
          description: error || "Failed to add command",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Add Failed",
        description: "Network error while adding command",
      });
    } finally {
      setIsAddingCommand(false);
    }
  };

  const handleDeleteCommand = async (commandName: string) => {
    try {
      const res = await fetch(`/api/bot/commands/${encodeURIComponent(commandName)}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setCommands(prev => prev.filter(cmd => cmd.name !== commandName));
        toast({
          title: "Command Deleted",
          description: `Successfully deleted command "${commandName}"`,
        });
      } else {
        const error = await res.text();
        toast({
          variant: "destructive",
          title: "Delete Failed",
          description: error || "Failed to delete command",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: "Network error while deleting command",
      });
    }
  };

  const handleAddBlacklistChannel = async () => {
    const channelName = newBlacklistChannel.trim().toLowerCase().replace(/^#/, '');
    if (!channelName) return;

    try {
      const res = await fetch('/api/bot/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelName }),
      });

      if (res.ok) {
        setNewBlacklistChannel('');
        await fetchBlacklist();
        await fetchChannels();
        toast({
          title: 'Blacklisted',
          description: `#${channelName} is now blocked from bot joins/messages`,
        });
      } else {
        const error = await res.text();
        toast({
          variant: 'destructive',
          title: 'Blacklist Failed',
          description: error || 'Failed to blacklist channel',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Blacklist Failed',
        description: 'Network error while blacklisting channel',
      });
    }
  };

  const handleRemoveBlacklistChannel = async (channelName: string) => {
    try {
      const res = await fetch('/api/bot/blacklist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelName }),
      });

      if (res.ok) {
        await fetchBlacklist();
        toast({
          title: 'Blacklist Removed',
          description: `#${channelName} can be managed again`,
        });
      } else {
        const error = await res.text();
        toast({
          variant: 'destructive',
          title: 'Remove Failed',
          description: error || 'Failed to remove blacklisted channel',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Remove Failed',
        description: 'Network error while removing blacklist',
      });
    }
  };

  const allChannels = [
    ...channels,
    ...pendingChannels.map(name => ({ name, joined: false, status: 'pending' as const }))
  ];

  const filteredChannels = (searchFilter.trim()
    ? allChannels.filter(c => c.name.toLowerCase().includes(searchFilter.toLowerCase()))
    : allChannels).sort((a, b) => {
      if (a.joined && !b.joined) return -1;
      if (!a.joined && b.joined) return 1;
      return 0;
    });

  const protectedCommands = ['join', 'card', 'bingo', 'tag'];

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          <CardTitle className="font-headline">
            Bot Management
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="channels" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="channels">Channels ({allChannels.length})</TabsTrigger>
            <TabsTrigger value="commands">Commands ({commands.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="channels" className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={fetchChannels} disabled={isRefreshing} size="sm" variant="ghost">
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Info about auto-management */}
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
              ℹ️ Bot automatically joins live channels and leaves offline ones every 4 minutes.
            </div>

            {/* Manual Add & Join Section */}
            <div className="flex gap-2">
              <Input
                placeholder="Add & join channel (without #)"
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddChannel()}
                className="flex-1"
              />
              <Button onClick={handleAddChannel} disabled={isLoading || !newChannel.trim()} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add & Join
              </Button>
            </div>

            {/* Search Filter */}
            <Input
              placeholder="Search channels..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full"
            />
            <div className="space-y-2 rounded-md border p-3">
              <div className="text-sm font-medium">Blacklist Management</div>
              <div className="flex gap-2">
                <Input
                  placeholder="Blacklist channel (without #)"
                  value={newBlacklistChannel}
                  onChange={(e) => setNewBlacklistChannel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddBlacklistChannel()}
                  className="flex-1"
                />
                <Button onClick={handleAddBlacklistChannel} size="sm" variant="destructive">
                  Block
                </Button>
              </div>
              <ScrollArea className="h-24">
                <div className="space-y-1 pr-2">
                  {blacklistedChannels.length === 0 && (
                    <div className="text-xs text-muted-foreground">No blacklisted channels</div>
                  )}
                  {blacklistedChannels.map((channel) => (
                    <div key={channel} className="flex items-center justify-between rounded border p-2">
                      <Badge variant="outline" className="font-mono">#{channel}</Badge>
                      <Button
                        onClick={() => handleRemoveBlacklistChannel(channel)}
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                      >
                        Unblock
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            {searchFilter && (
              <div className="text-sm text-muted-foreground">
                Showing {filteredChannels.length} of {allChannels.length} channels
              </div>
            )}

            {/* Channels List */}
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {filteredChannels.map((channel, index) => (
                  <div key={`${channel.name}-${index}`} className="flex items-center justify-between gap-3 p-3 rounded-md border bg-card/50">
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={channel.status === 'joined' ? 'default' : channel.status === 'pending' ? 'secondary' : 'destructive'}
                        className="font-mono"
                      >
                        #{channel.name}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {channel.status === 'joined' ? 'Joined' :
                         channel.status === 'pending' ? 'Pending' :
                         channel.status === 'joining' ? 'Joining...' : 'Failed'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {!channel.joined && (
                        <>
                          <Button
                            onClick={() => handleJoinSingleChannel(channel.name)}
                            disabled={isLoading}
                            size="sm"
                            variant="default"
                            className="h-8"
                          >
                            <Play className="mr-1 h-3 w-3" />
                            Join
                          </Button>
                          <Button
                            onClick={() => handleRemoveChannel(channel.name)}
                            disabled={isLoading}
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {channel.joined && (
                        <>
                          <Button
                            onClick={() => handleLeaveChannel(channel.name)}
                            disabled={isLoading}
                            size="sm"
                            variant="outline"
                            className="h-8"
                          >
                            <X className="mr-1 h-3 w-3" />
                            Leave
                          </Button>
                          <Button
                            onClick={() => handleRemoveChannel(channel.name)}
                            disabled={isLoading}
                            size="sm"
                            variant="destructive"
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {filteredChannels.length === 0 && searchFilter && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>No channels match "{searchFilter}"</p>
                  </div>
                )}
                {allChannels.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>No channels available</p>
                    <p className="text-sm">Channels will appear here after Discord sync</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="commands" className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={fetchCommands} size="sm" variant="ghost">
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>

            {/* Add Command Section */}
            <div className="space-y-2">
              <Input
                placeholder="Command name (e.g., 'hello')"
                value={newCommandName}
                onChange={(e) => setNewCommandName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddCommand()}
              />
              <Textarea
                placeholder="Command description (optional)"
                value={newCommandDescription}
                onChange={(e) => setNewCommandDescription(e.target.value)}
                rows={2}
              />
              <Button onClick={handleAddCommand} disabled={isAddingCommand || !newCommandName.trim()} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Command
              </Button>
            </div>

            {/* Commands List */}
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {commands.map((command) => (
                  <div key={command.name} className="flex items-center justify-between gap-3 p-3 rounded-md border bg-card/50">
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={command.enabled ? 'default' : 'secondary'}
                        className="font-mono"
                      >
                        @{command.name}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {command.description}
                      </span>
                      {protectedCommands.includes(command.name) && (
                        <Badge variant="outline" className="text-xs">
                          Protected
                        </Badge>
                      )}
                    </div>
                    {!protectedCommands.includes(command.name) && (
                      <Button
                        onClick={() => handleDeleteCommand(command.name)}
                        size="sm"
                        variant="destructive"
                        className="h-8 w-8 p-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {commands.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>No commands available</p>
                    <p className="text-sm">Add commands above to get started</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
