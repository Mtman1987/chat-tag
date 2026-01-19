'use client';

import type { Player } from '@/lib/types';
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
import { Target, Shield, Shuffle, Play, UserCheck, RefreshCw, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from './ui/scroll-area';
import { useFirestore, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc, writeBatch, serverTimestamp, collection, addDoc, Timestamp } from 'firebase/firestore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface ChatTagGameProps {
  players: Player[];
}

type GameSettings = {
  tagSuccessPoints?: number;
  tagPenaltyPoints?: number;
};

// Helper function to trigger the Discord update
const triggerDiscordUpdate = () => {
  fetch('/api/update-discord', { method: 'POST' }).catch(console.error);
};


export function ChatTagGame({ players }: ChatTagGameProps) {
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  const settingsDocRef = useMemoFirebase(
    () => (firestore ? doc(firestore, 'gameSettings', 'default') : null),
    [firestore]
  );
  const { data: settings } = useDoc<GameSettings>(settingsDocRef);
  const tagSuccessPoints = settings?.tagSuccessPoints ?? 100;
  const tagPenaltyPoints = settings?.tagPenaltyPoints ?? 50;

  const handleTag = async (taggedPlayer: Player, streamHost: Player) => {
    if (!user || !firestore) return;

    const tagger = players.find((p) => p.id === user.uid);
    if (!tagger || !tagger.isIt) return;
    
    if (user.uid === taggedPlayer.id) {
        toast({
            variant: 'destructive',
            title: 'Nice try!',
            description: 'You cannot tag yourself.',
        });
        return;
    }

    // Rule: Prevent tagging in the same stream where you were made "It".
    if (tagger.lastTaggedInStreamId === streamHost.id) {
      toast({
        variant: 'destructive',
        title: 'Tag-back Prevented',
        description: 'You must tag someone in a different stream than where you were tagged.',
      });
      return;
    }
    
    // Rule: Check if the target is immune.
    if (taggedPlayer.tagImmunityUntil && taggedPlayer.tagImmunityUntil.toDate() > new Date()) {
      toast({
        variant: 'destructive',
        title: 'Target is Immune',
        description: `${taggedPlayer.twitchUsername} is immune from being tagged for a little while.`,
      });
      return;
    }


    const tagEventCollection = collection(firestore, 'chatTags');
    const newTagEvent = {
      taggerId: user.uid,
      taggedId: taggedPlayer.id,
      streamerId: streamHost.id,
      timestamp: serverTimestamp(),
    };

    try {
      await addDoc(tagEventCollection, newTagEvent);

      const batch = writeBatch(firestore);

      const taggerRef = doc(firestore, 'users', user.uid);
      const taggedRef = doc(firestore, 'users', taggedPlayer.id);

      // Set 15-minute immunity for the tagger
      const immunityExpires = Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);

      batch.update(taggerRef, { 
        score: (tagger.score || 0) + tagSuccessPoints, 
        isIt: false,
        tagImmunityUntil: immunityExpires,
        lastTaggedInStreamId: null // Clear this once you've successfully tagged someone
      });
      
      batch.update(taggedRef, { 
        score: (taggedPlayer.score || 0) - tagPenaltyPoints, 
        isIt: true,
        lastTaggedInStreamId: streamHost.id, // Record where the new "It" was tagged
      });

      await batch.commit();

      // Trigger the Discord update after a successful tag
      triggerDiscordUpdate();

      toast({
        title: 'Tagged!',
        description: `You tagged ${taggedPlayer.twitchUsername} in ${streamHost.twitchUsername}'s chat and earned ${tagSuccessPoints} points.`,
      });

    } catch (e: any) {
      console.error(e);
      toast({
        variant: 'destructive',
        title: 'Uh oh! Something went wrong.',
        description: e.message || 'Could not tag player.',
      });
    }
  };

  const handleRandomizeIt = async () => {
    if (!firestore || players.length === 0) return;

    const potentialPlayers = players.filter(p => !p.isActive);
    if (potentialPlayers.length === 0) {
        toast({
            variant: "destructive",
            title: "Randomization Failed",
            description: "There are no available players (who are not streaming) to choose from.",
        });
        return;
    }

    const batch = writeBatch(firestore);

    const currentIt = players.find(p => p.isIt);
    if (currentIt) {
      const currentItRef = doc(firestore, 'users', currentIt.id);
      batch.update(currentItRef, { isIt: false });
    }

    const randomPlayer = potentialPlayers[Math.floor(Math.random() * potentialPlayers.length)];
    const randomPlayerRef = doc(firestore, 'users', randomPlayer.id);
    batch.update(randomPlayerRef, { isIt: true, lastTaggedInStreamId: null });

    await batch.commit();

    toast({
      title: '"It" has been randomized!',
      description: `${randomPlayer.twitchUsername} is the new "It". No points were changed.`,
    });
  };

  const handleMakeMeIt = async () => {
    try {
      const res = await fetch('/api/admin/make-me-it', { method: 'POST' });
      if (res.ok) {
        toast({ title: 'You are now "It"!', description: 'You have been set as "It".' });
      }
    } catch (error) {
      console.error('Failed to make me it:', error);
    }
  };

  const handleMtmanSleep = async () => {
    if (!firestore) return;

    const mtman = players.find(p => p.twitchUsername.toLowerCase() === 'mtman1987');
    if (!mtman) {
      toast({
        variant: "destructive",
        title: "Mtman not found",
        description: "Mtman1987 is not in the game.",
      });
      return;
    }

    const mtmanRef = doc(firestore, 'users', mtman.id);
    const immunityExpires = mtman.tagImmunityUntil && mtman.tagImmunityUntil.toDate() > new Date()
      ? null
      : Timestamp.fromMillis(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year

    await writeBatch(firestore)
      .update(mtmanRef, { tagImmunityUntil: immunityExpires })
      .commit();

    toast({
      title: immunityExpires ? 'Mtman is sleeping' : 'Mtman is awake',
      description: immunityExpires 
        ? 'MTMAN IS SLEEPING - try tagging someone you see in chat'
        : 'Mtman1987 can be tagged again',
    });
  };

  const handleTriggerTimeout = async () => {
    try {
      const res = await fetch('/api/admin/make-me-it', { method: 'PUT' });
      if (res.ok) {
        const data = await res.json();
        toast({ title: 'FREE FOR ALL!', description: data.announcement });
      }
    } catch (error) {
      console.error('Failed to trigger timeout:', error);
    }
  };
  
  if (!user) return null;

  const liveStreamers = players.filter((p) => p.isActive && p.id !== user.uid);
  const currentUserIsIt = players.find(p => p.id === user.id)?.isIt || false;
  
  const isPlayerImmune = (player: Player): boolean => {
    return !!player.tagImmunityUntil && player.tagImmunityUntil.toDate() > new Date();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className='space-y-1'>
            <h3 className="font-headline text-lg">Who will you tag?</h3>
            <p className="text-muted-foreground text-sm">
                {currentUserIsIt 
                ? "You are 'It'! Tag another player in an active stream to make them 'It'."
                : "You are safe... for now. Wait until you are 'It' to tag someone."
                }
            </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRandomizeIt}>
            <Shuffle className="mr-2 h-4 w-4" />
            Randomize 'It'
          </Button>
          <Button variant="default" size="sm" onClick={handleMakeMeIt}>
            <Target className="mr-2 h-4 w-4" />
            Make Me It
          </Button>
          <Button variant="secondary" size="sm" onClick={handleMtmanSleep}>
            <Shield className="mr-2 h-4 w-4" />
            {players.find(p => p.twitchUsername.toLowerCase() === 'mtman1987')?.tagImmunityUntil && 
             players.find(p => p.twitchUsername.toLowerCase() === 'mtman1987')!.tagImmunityUntil!.toDate() > new Date()
              ? 'Wake Mtman' : 'Mtman Sleep'}
          </Button>
          <Button variant="destructive" size="sm" onClick={handleTriggerTimeout}>
            <Clock className="mr-2 h-4 w-4" />
            Trigger Timeout
          </Button>
        </div>
      </div>

      <TooltipProvider>
        <ScrollArea className="h-[24rem] rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {players.map((player) => (
                <TableRow key={player.id} className={isPlayerImmune(player) ? 'opacity-60' : ''}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage
                          src={player.avatarUrl}
                          alt={player.twitchUsername}
                          data-ai-hint="profile picture"
                        />
                        <AvatarFallback>
                          {player.twitchUsername.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{player.twitchUsername}</span>
                        {player.isIt && (
                          <div className="flex items-center gap-1 text-primary text-xs font-semibold animate-pulse">
                            <Target className="h-4 w-4" />
                            <span>It!</span>
                          </div>
                        )}
                        {isPlayerImmune(player) && (
                           <Tooltip>
                            <TooltipTrigger>
                               <Shield className="h-4 w-4 text-cyan-400" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{player.twitchUsername} is immune from being tagged.</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          disabled={!currentUserIsIt || isPlayerImmune(player) || player.id === user.uid}
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
                              {host.twitchUsername}'s stream
                            </DropdownMenuItem>
                          ))
                        ) : (
                          <DropdownMenuItem disabled>
                            No live streams
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </TooltipProvider>
    </div>
  );
}

    