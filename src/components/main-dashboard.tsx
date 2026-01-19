'use client';

import { useMemo, useEffect } from 'react';
import type { Player } from '@/lib/types';
import {
  useAuth,
  useUser,
  useFirestore,
  useCollection,
  useMemoFirebase,
  setDocumentNonBlocking,
  updateDocumentNonBlocking,
  addDocumentNonBlocking,
  useDoc,
} from '@/firebase';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CommunityList } from '@/components/community-list';
import { Leaderboard } from '@/components/leaderboard';
import { BingoCard } from '@/components/bingo-card';
import { ChatTagGame } from '@/components/chat-tag-game';
import { Card } from '@/components/ui/card';
import TwitchLoginButton from './TwitchLoginButton';


function getNewPlayer(userId: string, username: string | null, avatar: string | null): Player {
  return {
    id: userId,
    twitchUsername: username || `Player_${userId.substring(0, 5)}`,
    avatarUrl: avatar || `https://picsum.photos/seed/${userId}/100/100`,
    score: 0,
    isIt: false,
    isActive: false, // Default to inactive on first login
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
    // This effect runs when a user is authenticated
    if (user && firestore && players && !players.find(p => p.id === user.uid)) {
      const userDocRef = doc(firestore, 'users', user.uid);
      
      const newPlayerData = getNewPlayer(user.uid, user.displayName, user.photoURL);

      // Randomly set one player as 'It' if no one is.
      const isAnyoneIt = players.some(p => p.isIt);
      if (!isAnyoneIt && players.length === 0) { // Only make the very first player 'It'
        newPlayerData.isIt = true;
      }
      
      setDocumentNonBlocking(userDocRef, newPlayerData, { merge: true });
    }
  }, [user, firestore, players]);

  const activePlayers = useMemo(() => memoizedPlayers.filter(p => p.isActive) || [], [memoizedPlayers]);

  const bingoSquarePoints = settings?.bingoSquarePoints ?? 10;
  const bingoWinPoints = settings?.bingoWinPoints ?? 250;

  const handleScoreUpdate = (playerId: string, points: number) => {
    if (!firestore || !players) return;
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    const userDocRef = doc(firestore, 'users', playerId);
    updateDocumentNonBlocking(userDocRef, { score: player.score + points });
  };
  
  const handleSquareClaim = () => {
    if (!user) return;
    handleScoreUpdate(user.uid, bingoSquarePoints);
  };

  const handleBingo = () => {
    if (!user || !firestore) return;
    handleScoreUpdate(user.uid, bingoWinPoints);
    const bingoEventsCollection = collection(firestore, 'bingoEvents');
    addDocumentNonBlocking(bingoEventsCollection, {
      userId: user.uid,
      points: bingoWinPoints,
      timestamp: serverTimestamp(),
    });
  };
  
  if (isUserLoading || (user && playersIsLoading)) {
    return (
        <div className="flex justify-center items-center min-h-screen">
          <div className="text-2xl font-headline">Loading Astro Clash...</div>
        </div>
      );
  }

  if (!user) {
     return (
      <div className="flex flex-col gap-4 justify-center items-center min-h-screen">
        <h1 className="text-4xl font-headline text-primary">Welcome to Astro Twitch Clash</h1>
        <p className="text-lg text-muted-foreground">Sign in with Twitch to join the game.</p>
        <TwitchLoginButton />
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
            <TabsList className="grid w-full grid-cols-2 bg-secondary/50">
              <TabsTrigger value="bingo" className="font-headline">Chat Bingo</TabsTrigger>
              <TabsTrigger value="chat-tag" className="font-headline">Chat Tag</TabsTrigger>
            </TabsList>
            <TabsContent value="bingo" className="mt-6">
              <BingoCard 
                onBingo={handleBingo}
                onSquareClaim={handleSquareClaim}
                activePlayers={activePlayers}
              />
            </TabsContent>
            <TabsContent value="chat-tag" className="mt-6">
              <ChatTagGame players={memoizedPlayers} />
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
