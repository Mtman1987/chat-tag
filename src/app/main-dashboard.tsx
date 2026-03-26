
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
    if (!user && !isUserLoading && auth) {
      signInAnonymously(auth).catch(console.error);
    }
  }, [user, isUserLoading, auth]);

  useEffect(() => {
    if (user && !user.isAnonymous && firestore && players && !players.find(p => p.id === user.uid)) {
      const userDocRef = doc(firestore, 'users', user.uid);
      const newPlayerData = getNewPlayer(user.uid, user.displayName, user.photoURL);

      const isAnyoneIt = players.some(p => p.isIt);
      if (!isAnyoneIt) {
        newPlayerData.isIt = true;
      }
      
      setDoc(userDocRef, newPlayerData, { merge: true });
    }
  }, [user, firestore, players]);

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
  };
  
  if (isUserLoading || (user && playersIsLoading)) {
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
            <TabsList className="grid w-full grid-cols-5 bg-secondary/50">
              <TabsTrigger value="bingo" className="font-headline">Chat Bingo</TabsTrigger>
              <TabsTrigger value="chat-tag" className="font-headline">Chat Tag</TabsTrigger>
              <TabsTrigger value="live-members" className="font-headline">Live Members</TabsTrigger>
              <TabsTrigger value="bot" className="font-headline">Bot Channels</TabsTrigger>
              <TabsTrigger value="share" className="font-headline">Share</TabsTrigger>
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
