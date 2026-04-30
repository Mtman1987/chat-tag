'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Target, Shield, Shuffle, Play, UserCheck, RefreshCw, Clock, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useState, useEffect } from 'react';
import { useLiveStreamers } from '@/contexts/live-streamers-context';
import type { Player as FirestorePlayer } from '@/lib/types';

interface GamePlayer {
  id: string;
  username: string;
  avatar: string;
  isIt: boolean;
  isActive: boolean;
  isImmune?: boolean;
}

interface StreamHost {
  id: string;
  username: string;
}

interface ChatTagGameProps {
  players?: FirestorePlayer[];
}

export function ChatTagGame({ players = [] }: ChatTagGameProps) {
  const { toast } = useToast();
  const { liveStreamers } = useLiveStreamers();
  const [gameState, setGameState] = useState({
    currentIt: null as string | null,
    immunePlayers: new Set<string>(),
    players: [] as any[],
    lastTagTime: null as number | null,
    tagHistory: [] as any[],
    immunity: {} as Record<string, any>,
    monthlyWinners: [] as any[],
  });
  const [communityPlayers, setCommunityPlayers] = useState<GamePlayer[]>([]);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [addPlayerName, setAddPlayerName] = useState('');
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);

  const ts = (value: any): number => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  // Fetch community members
  const fetchCommunity = async () => {
    try {
      const res = await fetch('/api/discord/members', { cache: 'no-store' });
      if (res.ok) {
        const { members } = await res.json();
        const playerList = members.map((member: any) => ({
          id: member.username,
          username: member.username,
          avatar: member.avatar ? `https://cdn.discordapp.com/avatars/${member.id}/${member.avatar}.png` : `https://picsum.photos/40/40?${member.username}`,
          isIt: false,
          isActive: false
        }));
        setCommunityPlayers(playerList);
      }
    } catch (e) {
      console.error('Failed to fetch community', e);
    }
  };

  // Fetch shared state
  const fetchState = async () => {
    try {
      const res = await fetch('/api/tag', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const players = data.players || [];
        const itPlayer = players.find((p: any) => p.isIt);
        const immunePlayers = new Set<string>();
        const immunity: Record<string, any> = {};
        
        players.forEach((p: any) => {
          if (p.sleepingImmunity) {
            immunePlayers.add(p.id);
            immunity[p.id] = 'sleeping';
          }
          if (p.offlineImmunity) {
            immunePlayers.add(p.id);
            immunity[`${p.id}_offline`] = true;
          }
          if (p.noTagbackFrom) {
            immunePlayers.add(p.id);
            immunity[p.id] = p.noTagbackFrom;
          }
          if (p.timedImmunityUntil) {
            immunePlayers.add(p.id);
            immunity[`${p.id}_timed`] = p.timedImmunityUntil;
          }
        });
        
        setGameState({
          currentIt: itPlayer?.id || null,
          immunePlayers,
          players,
          lastTagTime: data.lastTagTime || null,
          tagHistory: (data.history || []).sort((a: any, b: any) => {
            return ts(b.timestamp) - ts(a.timestamp);
          }).slice(0, 50),
          immunity,
          monthlyWinners: data.monthlyWinners || [],
        });
      }
    } catch (e) {
      console.error('Failed to fetch tag state', e);
    }
  };

  useEffect(() => {
    fetchCommunity();
    fetchState();
    const interval = setInterval(fetchState, 5000);
    const onVisible = () => {
      if (!document.hidden) fetchState();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Mock players if none provided (fallback)
  const fallbackPlayers: GamePlayer[] =
    players.length > 0
      ? players.map((player) => ({
          id: player.id,
          username: player.twitchUsername || player.id,
          avatar: player.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(player.twitchUsername || player.id)}&background=random`,
          isIt: player.isIt,
          isActive: player.isActive,
        }))
      : [];
  const availablePlayers = communityPlayers.length > 0 ? communityPlayers : fallbackPlayers;
  // Convert Discord players to display format
  const gamePlayers = gameState.players.map((p: any) => ({
    id: p.id,
    username: p.twitchUsername || p.username,
    avatar: p.avatarUrl || p.avatar || `https://ui-avatars.com/api/?name=${p.twitchUsername || p.username}&background=random`,
    isIt: p.id === gameState.currentIt,
    isActive: false // You can enhance this later with live status
  }));
  
  // Get current user from user profile API
  const [currentUsername, setCurrentUsername] = useState<string>('');
  
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const res = await fetch('/api/user-profile');
        if (res.ok) {
          const data = await res.json();
          if (data.twitch?.name) {
            setCurrentUsername(data.twitch.name.toLowerCase());
          }
        }
      } catch (e) {
        console.error('Failed to fetch user profile', e);
      }
    };
    fetchUserProfile();
  }, []);
  
  const currentUser = availablePlayers.find(p => p.username?.toLowerCase() === currentUsername) || availablePlayers[0];

  const handleTag = async (taggedPlayer: GamePlayer, streamHost: StreamHost) => {
    try {
      const taggerPlayer = gameState.players.find((p: any) => p.id === gameState.currentIt);
      if (!taggerPlayer) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not find tagger in game state.' });
        return;
      }
      
      const res = await fetch('/api/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'tag',
          userId: taggerPlayer.id,
          targetUserId: taggedPlayer.id,
          streamerId: streamHost.username
        })
      });
      
      if (!res.ok) {
        const error = await res.json();
        toast({ variant: 'destructive', title: 'Tag Failed', description: error.error || 'Could not process tag.' });
        return;
      }
      
      toast({ title: 'Tagged!', description: `${taggedPlayer.username} is now "It"!` });
      setTimeout(fetchState, 500);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Failed', description: 'Could not process tag.' });
    }
  };

  const handleRandomizeIt = async () => {
    if (gamePlayers.length === 0) return;
    const randomPlayer = gamePlayers[Math.floor(Math.random() * gamePlayers.length)];
    
    try {
      const res = await fetch('/api/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'set-it',
          userId: randomPlayer.id
        })
      });
      
      if (res.ok) {
        setTimeout(fetchState, 500);
        toast({ title: '"It" has been randomized!', description: `${randomPlayer.username} is the new "It".` });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Failed to randomize' });
    }
  };

  const joinGame = async () => {
    if (!currentUser) return;
    
    try {
      const response = await fetch('/api/user-profile');
      let userInfo = { username: currentUser.username, avatar: currentUser.avatar };
      
      if (response.ok) {
        const data = await response.json();
        if (data.twitch) {
          userInfo = {
            username: data.twitch.name,
            avatar: data.twitch.avatar
          };
        }
      }
      
      // Add to tag game
      await fetch('/api/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'join',
          userId: userInfo.username,
          username: userInfo.username,
          avatar: userInfo.avatar
        })
      });
      
      // Add to bot channels and mark as live
      await fetch('/api/bot/channels/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: userInfo.username.toLowerCase() })
      });
      
      fetchState();
      toast({ title: 'Joined Game', description: 'You have joined the game of Tag!' });
      
      setTimeout(fetchState, 1000);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Join Failed', description: 'Could not join the game.' });
    }
  };

  const leaveGame = async () => {
    if (!currentUser) return;
    
    try {
      const response = await fetch('/api/user-profile');
      let userInfo = { username: currentUser.username };
      
      if (response.ok) {
        const data = await response.json();
        if (data.twitch) {
          userInfo = { username: data.twitch.name };
        }
      }
      
      await fetch('/api/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'leave',
          userId: userInfo.username
        })
      });
      
      fetchState();
      toast({ title: 'Left Game', description: 'You have left the game of Tag.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Leave Failed', description: 'Could not leave the game.' });
    }
  };

  const currentUserIsIt = gameState.players.some((p: any) => 
    (p.id === currentUser?.username || p.username === currentUser?.username) && 
    p.id === gameState.currentIt
  );

  const handleAddPlayer = async () => {
    const name = addPlayerName.trim().toLowerCase();
    if (!name) return;
    setIsAddingPlayer(true);
    try {
      // Add to tag game
      const tagRes = await fetch('/api/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', userId: `manual_${name}`, twitchUsername: name, avatar: '' })
      });
      const tagData = await tagRes.json();
      if (tagData.error && tagData.error !== 'Already in game') {
        toast({ variant: 'destructive', title: 'Add Failed', description: tagData.error });
        setIsAddingPlayer(false);
        return;
      }
      // Add to bot channels
      await fetch('/api/bot/channels/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: name })
      });
      setAddPlayerName('');
      toast({ title: 'Player Added', description: `${name} added to game + bot channels + community` });
      setTimeout(fetchState, 500);
    } catch {
      toast({ variant: 'destructive', title: 'Add Failed' });
    } finally {
      setIsAddingPlayer(false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) return;
    
    try {
      await fetch('/api/bot/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: broadcastMessage })
      });
      
      toast({ title: 'Broadcast Sent', description: `Message sent to all live channels` });
      setBroadcastMessage('');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Broadcast Failed', description: 'Could not queue message.' });
    }
  };

  const sharedChannelSet = new Set(
    liveStreamers
      .filter((s: any) => Boolean(s?.isSharedChat))
      .flatMap((s: any) => [String(s.id || '').toLowerCase(), String(s.username || '').toLowerCase()])
      .filter(Boolean)
  );
  const liveChannelSet = new Set(
    liveStreamers
      .flatMap((s: any) => [String(s.id || '').toLowerCase(), String(s.username || '').toLowerCase()])
      .filter(Boolean)
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className='space-y-1'>
          <h3 className="font-headline text-lg">Tag Game ({gamePlayers.length} Players)</h3>
          <p className="text-muted-foreground text-sm">
            {currentUserIsIt 
              ? "You are 'It'! Tag another player."
              : gameState.currentIt 
                ? `${gamePlayers.find(p => p.id === gameState.currentIt)?.username || 'Someone'} is 'It'.`
                : "No one is 'It'."
            }
          </p>
          {gameState.lastTagTime && (
            <p className="text-muted-foreground text-xs">
              Last tag: {new Date(gameState.lastTagTime).toLocaleString()} ({Math.floor((Date.now() - gameState.lastTagTime) / 1000 / 60 / 60)}h {Math.floor(((Date.now() - gameState.lastTagTime) / 1000 / 60) % 60)}m ago)
            </p>
          )}
        </div>
        <div className="flex gap-2">
            {!gameState.players.some((p: any) => 
                p.id === currentUser?.username || 
                p.username === currentUser?.username ||
                p.id?.toLowerCase() === currentUser?.username?.toLowerCase() ||
                p.username?.toLowerCase() === currentUser?.username?.toLowerCase()
            ) ? (
                <Button variant="default" size="sm" onClick={joinGame}>
                <Play className="mr-2 h-4 w-4" /> Join Game
                </Button>
            ) : (
                <Button variant="outline" size="sm" onClick={leaveGame}>
                <UserCheck className="mr-2 h-4 w-4" /> Leave Game
                </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleRandomizeIt}>
            <Shuffle className="mr-2 h-4 w-4" /> Randomize
            </Button>
            <Button variant="default" size="sm" onClick={async () => {
              try {
                const mePlayer = gameState.players.find((p: any) => 
                  p.twitchUsername?.toLowerCase() === currentUsername?.toLowerCase() ||
                  p.id?.toLowerCase() === currentUsername?.toLowerCase()
                );
                if (!mePlayer) {
                  toast({ variant: 'destructive', title: 'You are not in the game' });
                  return;
                }
                
                await fetch('/api/tag', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'wake', userId: mePlayer.id })
                });
                
                await fetch('/api/tag', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'set-it', userId: mePlayer.id })
                });
                
                setTimeout(fetchState, 500);
                toast({ title: 'You are now It!' });
              } catch (e) {
                toast({ variant: 'destructive', title: 'Failed to set It' });
              }
            }}>
            <Target className="mr-2 h-4 w-4" /> Make Me It
            </Button>
            <Button variant="secondary" size="sm" onClick={async () => {
              try {
                const mePlayer = gameState.players.find((p: any) => 
                  p.twitchUsername?.toLowerCase() === currentUsername?.toLowerCase() ||
                  p.id?.toLowerCase() === currentUsername?.toLowerCase()
                );
                if (!mePlayer) {
                  toast({ variant: 'destructive', title: 'You are not in the game' });
                  return;
                }
                
                const isSleeping = gameState.immunity[mePlayer.id] === 'sleeping';
                
                await fetch('/api/tag', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: isSleeping ? 'wake' : 'sleep',
                    userId: mePlayer.id
                  })
                });
                
                setTimeout(fetchState, 500);
                toast({ 
                  title: isSleeping ? 'You are Awake' : 'You are Sleeping', 
                  description: isSleeping ? 'You can be tagged again' : 'You are now immune from tags' 
                });
              } catch (e) {
                toast({ variant: 'destructive', title: 'Failed to toggle immunity' });
              }
            }}>
            <Shield className="mr-2 h-4 w-4" /> {(() => {
              const me = gameState.players.find((p: any) => 
                p.twitchUsername?.toLowerCase() === currentUsername?.toLowerCase() ||
                p.id?.toLowerCase() === currentUsername?.toLowerCase()
              );
              return me && gameState.immunity[me.id] === 'sleeping' ? 'Wake Up' : 'Go Sleep';
            })()}
            </Button>
            <Button variant="destructive" size="sm" onClick={async () => {
              try {
                await fetch('/api/tag', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'auto-rotate' })
                });
                await fetch('/api/bot/broadcast', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ message: '⏰ Auto-rotate: FREE FOR ALL! Anyone can tag for DOUBLE POINTS! 🔥' })
                });
                setTimeout(fetchState, 500);
                toast({ title: 'Timeout Triggered', description: 'FREE FOR ALL MODE! Anyone can tag for double points!' });
              } catch (e) {
                toast({ variant: 'destructive', title: 'Failed to trigger timeout' });
              }
            }}>
            <Clock className="mr-2 h-4 w-4" /> Trigger Timeout
            </Button>
            <Button variant="destructive" size="sm" onClick={async () => {
              if (!confirm('Are you sure you want to reset all scores? This will clear all points and tag history.')) return;
              try {
                await fetch('/api/tag', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'reset-scores' })
                });
                setTimeout(fetchState, 500);
                toast({ title: 'Scores Reset', description: 'All points and tag history have been cleared.' });
              } catch (e) {
                toast({ variant: 'destructive', title: 'Failed to reset scores' });
              }
            }}>
            🔄 Reset Scores
            </Button>
            <Button variant="ghost" size="icon" onClick={fetchState}>
                <RefreshCw className="h-4 w-4" />
            </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Add player by Twitch username..."
          value={addPlayerName}
          onChange={(e) => setAddPlayerName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAddPlayer(); }}
          className="max-w-xs"
        />
        <Button onClick={handleAddPlayer} disabled={isAddingPlayer || !addPlayerName.trim()} size="sm">
          {isAddingPlayer ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Add Player
        </Button>
      </div>

      <ScrollArea className="h-[24rem] rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gamePlayers.map((player) => {
              const isImmune = gameState.immunePlayers.has(player.id);
              const isCurrentIt = player.id === gameState.currentIt;
              const isLive = liveChannelSet.has(String(player.username || '').toLowerCase());
              const isShared = sharedChannelSet.has(String(player.username || '').toLowerCase());
              const rawPlayer = gameState.players.find((p: any) => p.id === player.id);
              const hasOverlay = Boolean(rawPlayer?.overlayMode);
              const winnerEntry = gameState.monthlyWinners.find((w: any) => w.userId === player.id);
              
              return (
                <TableRow key={player.id} className={isImmune ? 'opacity-60' : ''}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={player.avatar} alt={player.username} />
                        <AvatarFallback>{player.username?.charAt(0) || '?'}</AvatarFallback>
                      </Avatar>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{player.username}</span>
                        {isCurrentIt && (
                          <div className="flex items-center gap-1 text-red-500 text-xs font-bold animate-pulse border border-red-500 px-1 rounded">
                            <Target className="h-3 w-3" />
                            <span>IT</span>
                          </div>
                        )}
                        {isImmune && (
                          <span title="Immune from being tagged">
                            <Shield className="h-4 w-4 text-cyan-400" />
                          </span>
                        )}
                        {isLive && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-green-500 text-green-500">
                            LIVE
                          </span>
                        )}
                        {isShared && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-500 text-amber-500"
                            title="In shared chat session"
                          >
                            SHARED
                          </span>
                        )}
                        {hasOverlay && (
                          <span
                            className={'text-[10px] font-bold px-1.5 py-0.5 rounded border border-purple-500 text-purple-500'}
                            title={'Overlay mode - bot messages go to OBS overlay instead of chat'}
                          >
                            📺 OBS
                          </span>
                        )}
                        {winnerEntry && (
                          <span
                            className={"text-[10px] font-bold px-1.5 py-0.5 rounded border border-yellow-500 text-yellow-500"}
                            title={`Monthly winner #${winnerEntry.place} — ${winnerEntry.month || ""}`}
                          >
                            👑 #{winnerEntry.place}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await fetch('/api/tag', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'set-it', userId: player.id })
                            });
                            
                            setTimeout(fetchState, 500);
                            toast({ title: 'Set as It', description: `${player.username} is now It!` });
                          } catch (e) {
                            toast({ variant: 'destructive', title: 'Failed to set It' });
                          }
                        }}
                      >
                        <Target className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          try {
                            const currentItName = gamePlayers.find((p) => p.id === gameState.currentIt)?.username || 'nobody';
                            const message = isCurrentIt
                              ? `🎯 @${player.username} Status: You are IT! Tag someone else to pass it on.`
                              : isImmune
                                ? `🛡️ @${player.username} Status: You are currently away/immune. Use @spmt wake when ready.`
                                : `ℹ️ @${player.username} Status: You are not IT right now. Current IT: ${currentItName}.`;
                            
                            await fetch('/api/bot/broadcast', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ message, channel: player.username.toLowerCase() })
                            });
                            toast({ title: 'Status Sent', description: `Sent status to ${player.username}` });
                          } catch (e) {
                            toast({ variant: 'destructive', title: 'Failed to queue' });
                          }
                        }}
                      >
                        📢
                      </Button>
                      <Button
                        size="sm"
                        variant={isImmune ? "secondary" : "outline"}
                        onClick={async () => {
                          try {
                            await fetch('/api/tag', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                action: isImmune ? 'wake' : 'sleep',
                                userId: player.id
                              })
                            });

                            setTimeout(fetchState, 500);
                            toast({
                              title: isImmune ? 'Player Awake' : 'Player Away',
                              description: isImmune
                                ? `${player.username} can be tagged again`
                                : `${player.username} is now away/immune`,
                            });
                          } catch (e) {
                            toast({ variant: 'destructive', title: 'Failed to update away status' });
                          }
                        }}
                      >
                        <Shield className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant={winnerEntry ? "default" : "outline"}
                        title={winnerEntry ? "Remove winner" : "Set as winner (next available place)"}
                        onClick={async () => {
                          try {
                            if (winnerEntry) {
                              const others = gameState.monthlyWinners.filter((w: any) => w.userId !== player.id);
                              await fetch("/api/tag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clear-winners" }) });
                              for (const w of others) {
                                await fetch("/api/tag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set-winner", userId: w.userId, place: w.place }) });
                              }
                              toast({ title: "Winner Removed", description: `${player.username} removed from winners` });
                            } else {
                              const usedPlaces = gameState.monthlyWinners.map((w: any) => w.place);
                              const nextPlace = [1, 2, 3].find((p) => !usedPlaces.includes(p));
                              if (!nextPlace) { toast({ variant: "destructive", title: "All 3 winner slots filled" }); return; }
                              await fetch("/api/tag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set-winner", userId: player.id, place: nextPlace }) });
                              toast({ title: "Winner Set!", description: `${player.username} is #${nextPlace} winner` });
                            }
                            setTimeout(fetchState, 500);
                          } catch (e) { toast({ variant: "destructive", title: "Failed to update winner" }); }
                        }}
                      >
                        👑
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        title="Award bonus points"
                        onClick={async () => {
                          const points = prompt(`Award points to ${player.username}:`, '100');
                          if (!points || isNaN(Number(points))) return;
                          try {
                            await fetch('/api/tag', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'award-points', userId: player.id, points: parseInt(points), performedBy: currentUsername })
                            });
                            toast({ title: 'Points Awarded', description: `Gave ${points} points to ${player.username}` });
                            setTimeout(fetchState, 500);
                          } catch (e) {
                            toast({ variant: 'destructive', title: 'Failed to award points' });
                          }
                        }}
                      >
                        💰
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant={isCurrentIt ? "destructive" : "secondary"}
                          >
                            Tag
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem disabled>
                            In whose chat?
                          </DropdownMenuItem>
                          {liveStreamers.length > 0 ? (
                            liveStreamers.map((host) => (
                              <DropdownMenuItem
                                key={host.id}
                                onClick={() => handleTag(player, host)}
                              >
                                {host.username}'s stream
                              </DropdownMenuItem>
                            ))
                          ) : (
                            <DropdownMenuItem disabled>
                              No live streams
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {gamePlayers.length === 0 && (
                <TableRow>
                    <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                        No players yet. Click "Join Game" to start!
                    </TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollArea>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">Tag History (Last 50)</h4>
        <ScrollArea className="h-[16rem] rounded-md border">
          <div className="p-4 space-y-2">
            {gameState.tagHistory.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">No tags yet</p>
            ) : (
              gameState.tagHistory.map((tag: any, idx: number) => {
                const streamerId = tag.streamerId || tag.channel?.replace('#', '');
                const isSystemTag = (tag.taggerId || tag.from) === 'system';
                const isBlocked = tag.blocked;
                const timestamp = tag.timestamp?.seconds ? tag.timestamp.seconds * 1000 : 
                                 (tag.timestamp?.toMillis ? tag.timestamp.toMillis() : 
                                 (typeof tag.timestamp === 'number' ? tag.timestamp : Date.now()));
                
                const fromName = tag.taggerUsername || tag.taggerId || tag.from;
                const toName = tag.taggedUsername || tag.taggedId || tag.to;
                
                return (
                  <div key={idx} className={`flex items-center gap-3 text-sm border-b pb-2 ${isBlocked ? 'opacity-60' : ''}`}>
                    <span className="text-muted-foreground text-xs w-32">
                      {new Date(timestamp).toLocaleString()}
                    </span>
                    {isBlocked ? (
                      <span className="flex-1">
                        <span className="font-medium">{fromName}</span>{' '}
                        <span className="text-red-500">tried to tag</span>{' '}
                        <span className="font-medium">{toName}</span>{' '}
                        <span className="text-muted-foreground">(blocked - {tag.blocked})</span>
                      </span>
                    ) : isSystemTag ? (
                      <span className="flex-1">
                        <span className="text-orange-500 font-medium">System</span> set{' '}
                        <span className="font-medium">{toName}</span> as it
                      </span>
                    ) : (
                      <span className="flex-1">
                        <span className="font-medium">{fromName}</span> tagged{' '}
                        <span className="font-medium">{toName}</span>
                        {streamerId && <span className="text-muted-foreground"> in {streamerId}</span>}
                        {tag.doublePoints && <span className="text-yellow-500 font-bold"> (2x points!)</span>}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">Broadcast Test</h4>
        <div className="flex gap-2">
          <Input
            placeholder="Type a message to broadcast to all player channels..."
            value={broadcastMessage}
            onChange={(e) => setBroadcastMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleBroadcast();
              }
            }}
          />
          <Button onClick={handleBroadcast} disabled={!broadcastMessage.trim()}>
            <Send className="mr-2 h-4 w-4" /> Send
          </Button>
        </div>
      </div>
    </div>
  );
}
