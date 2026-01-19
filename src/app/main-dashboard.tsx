
'use client';

import { useMemo, useEffect } from 'react';
import type { Player } from '@/lib/types';
import {
  useAuth,
  useUser,
  useFirestore,
  useCollection,
  useMemoFirebase,
  useDoc,
} from '@/firebase';
import { setDoc, doc, serverTimestamp, collection, addDoc, updateDoc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CommunityList } from '@/components/community-list';
import { Leaderboard } from '@/components/leaderboard';
import { BingoCard } from '@/components/bingo-card';
import { ChatTagGame } from '@/components/chat-tag-game';
import { LiveDiscordMembers } from '@/components/live-discord-members';
import { BotChannelManager } from '@/components/bot-channel-manager';
import { DiscordEmbedPoster } from '@/components/discord-embed-poster';
import { Card } from '@/components/ui/card';
import TwitchLoginButton from '@/components/TwitchLoginButton';
import { useToast } from '@/hooks/use-toast';

// Helper function to trigger the Discord update
const triggerDiscordUpdate = () => {
  fetch('/api/update-discord', { method: 'POST' }).catch(console.error);
};


function getNewPlayer(userId: string, username: string | null, avatar: string | null): Player {
  return {
    id: userId,
    twitchUsername: username || `Player_${userId.substring(0, 5)}`,
    avatarUrl: avatar || `https://picsum.photos/seed/${userId}/100/100`,
    score: 0,
    communityPoints: 0,
    isIt: false,
    isActive: false, 
  };
}

type GameSettings = {
    bingoSquarePoints?: number;
    bingoWinPoints?: number;
};

export function MainDashboard() {
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const usersCollection = useMemoFirebase(
    () => (firestore ? collection(firestore, 'users') : null),
    [firestore]
  );
  
  const settingsDocRef = useMemoFirebase(
    () => (firestore ? doc(firestore, 'gameSettings', 'default') : null),
    [firestore]
  );
  
  const { data: players, isLoading: playersIsLoading } = useCollection<Player>(usersCollection);
  const { data: settings } = useDoc<GameSettings>(settingsDocRef);
  
  const memoizedPlayers = useMemo(() => players || [], [players]);

  useEffect(() => {
    // This effect creates a player profile in Firestore if one doesn't exist for the logged-in user.
    if (user && !user.isAnonymous && firestore && players && !players.find(p => p.id === user.uid)) {
      const userDocRef = doc(firestore, 'users', user.uid);
      const newPlayerData = getNewPlayer(user.uid, user.displayName, user.photoURL);

      // If no one is "It" across the entire community, make the new player "It".
      // This ensures the game can always start.
      const isAnyoneIt = players.some(p => p.isIt);
      if (!isAnyoneIt) {
        newPlayerData.isIt = true;
      }
      
      setDoc(userDocRef, newPlayerData, { merge: true });
    }
  }, [user, firestore, players]);

  const liveStreamers = useMemo(() => memoizedPlayers.filter(p => p.isActive) || [], [memoizedPlayers]);
  const allPlayers = useMemo(() => memoizedPlayers || [], [memoizedPlayers]);


  const bingoSquarePoints = settings?.bingoSquarePoints ?? 10;
  const bingoWinPoints = settings?.bingoWinPoints ?? 250;

  const handleScoreUpdate = async (playerId: string, points: number) => {
    if (!firestore || !players) return;
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    const userDocRef = doc(firestore, 'users', playerId);
    const currentScore = player.score || 0;
    await updateDoc(userDocRef, { score: currentScore + points });
  };
  
  const handleSquareClaim = (claimerId: string) => {
    if (!user) return;
    handleScoreUpdate(claimerId, bingoSquarePoints);
    // The Discord update is now triggered inside the BingoCard component.
  };

  const handleBingo = async (bingoWinnerId: string) => {
    if (!firestore) return;
    handleScoreUpdate(bingoWinnerId, bingoWinPoints);
    const bingoEventsCollection = collection(firestore, 'bingoEvents');
    await addDoc(bingoEventsCollection, {
      userId: bingoWinnerId,
      points: bingoWinPoints,
      timestamp: serverTimestamp(),
    });
    // Trigger update after bingo win, as this is a major event
    triggerDiscordUpdate();
  };
  
  if (isUserLoading || (user && playersIsLoading)) {
    return (
        <div className="flex justify-center items-center min-h-screen">
          <div className="text-2xl font-headline animate-pulse">Loading Astro Clash...</div>
        </div>
      );
  }

  if (!user) {
     return (
      <div className="flex flex-col gap-4 justify-center items-center min-h-screen">
        <h1 className="text-4xl font-headline text-primary">Welcome to Astro Twitch Clash</h1>
        <p className="text-lg text-muted-foreground">Sign in with Twitch to join the game.</p>
        <div className="flex gap-4 items-center">
            <TwitchLoginButton />
        </div>
      </div>
    )
  }
  
  return (
    <div className="grid md:grid-cols-[320px_1fr] lg:grid-cols-[360px_1fr] gap-6 p-4 md:p-6">
      <aside className="flex flex-col gap-6">
        <CommunityList players={memoizedPlayers} />
        <Leaderboard players={memoizedPlayers} />
      </aside>
      
      <div className="min-w-0">
        <Card className="p-4 sm:p-6 bg-card/80 backdrop-blur-sm">
          <Tabs defaultValue="bingo" className="w-full">
            <TabsList className="grid w-full grid-cols-5 bg-secondary/50">
              <TabsTrigger value="bingo" className="font-headline">Chat Bingo</TabsTrigger>
              <TabsTrigger value="chat-tag" className="font-headline">Chat Tag</TabsTrigger>
              <TabsTrigger value="live-members" className="font-headline">Live Members</TabsTrigger>
              <TabsTrigger value="bot" className="font-headline">Bot Channels</TabsTrigger>
              <TabsTrigger value="share" className="font-headline">Share</TabsTrigger>
            </TabsList>
            <TabsContent value="bingo" className="mt-6">
              <BingoCard 
                onBingo={handleBingo}
                onSquareClaim={handleSquareClaim}
                liveStreamers={liveStreamers}
              />
            </TabsContent>
            <TabsContent value="chat-tag" className="mt-6">
              <ChatTagGame players={allPlayers} />
            </TabsContent>
            <TabsContent value="live-members" className="mt-6">
              <LiveDiscordMembers />
            </TabsContent>
            <TabsContent value="bot" className="mt-6">
              <BotChannelManager />
            </TabsContent>
            <TabsContent value="share" className="mt-6">
              <DiscordEmbedPoster />
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
