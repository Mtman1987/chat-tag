
"use client";

import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Plus, Shuffle, Check } from 'lucide-react';
import { commonBingoPhrases } from '@/lib/data';
import { BingoCell } from './bingo-cell';
import { useToast } from '@/hooks/use-toast';
import type { Player, BingoCardState } from '@/lib/types';
import { useFirestore, useDoc, useMemoFirebase, useUser, useCollection } from '@/firebase';
import { doc, setDoc, serverTimestamp, collection, addDoc, updateDoc, increment } from 'firebase/firestore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface BingoCardProps {
  onBingo: (bingoWinnerId: string) => void;
  onSquareClaim: (claimerId: string) => void;
  liveStreamers: Player[];
}

const BINGO_SIZE = 5;

const shuffleArray = <T,>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

const generateNewCardState = (): BingoCardState => {
    const shuffledPhrases = shuffleArray(commonBingoPhrases).slice(0, BINGO_SIZE * BINGO_SIZE - 1);
    const newPhrases = [...shuffledPhrases];
    const centerIndex = Math.floor((BINGO_SIZE * BINGO_SIZE) / 2);
    newPhrases.splice(centerIndex, 0, 'FREE SPACE');

    const covered = Array(BINGO_SIZE * BINGO_SIZE).fill(null);
    covered[centerIndex] = 'FREE';

    return {
        phrases: newPhrases,
        covered: covered,
        lastGenerated: serverTimestamp(),
    };
}

// Helper function to trigger the Discord update
const triggerDiscordUpdate = () => {
  fetch('/api/update-discord', { method: 'POST' }).catch(console.error);
};

export function BingoCard({ onBingo, onSquareClaim, liveStreamers }: BingoCardProps) {
  const [customPhrase, setCustomPhrase] = useState('');
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const [usedStreamers, setUsedStreamers] = useState<Set<string>>(new Set());

  const bingoCardDocRef = useMemoFirebase(
    () => (firestore ? doc(firestore, 'gameState', 'bingoCard') : null),
    [firestore]
  );
  
  const usersCollection = useMemoFirebase(
    () => (firestore ? collection(firestore, 'users') : null),
    [firestore]
  );
  
  const { data: bingoCard, isLoading } = useDoc<BingoCardState>(bingoCardDocRef);
  const { data: allPlayers } = useCollection<Player>(usersCollection);

  useEffect(() => {
    if (!isLoading && !bingoCard && bingoCardDocRef) {
      // If no card exists in the DB, create one.
      setDoc(bingoCardDocRef, generateNewCardState());
    }
    // Reset used streamers when a new card is loaded from the DB
    setUsedStreamers(new Set());
  }, [isLoading, bingoCard, bingoCardDocRef]);


  const handleSetCustomPhrase = () => {
    if (!customPhrase.trim() || !bingoCardDocRef || !bingoCard) return;
    const newPhrases = [...bingoCard.phrases];
    const centerIndex = Math.floor((BINGO_SIZE * BINGO_SIZE) / 2);
    newPhrases[centerIndex] = customPhrase;
    setDoc(bingoCardDocRef, { phrases: newPhrases }, { merge: true });
    setCustomPhrase('');
  };

  const checkBingo = (currentCovered: (string | null)[]) => {
     // Check rows
    for (let i = 0; i < BINGO_SIZE; i++) {
        const row = currentCovered.slice(i * BINGO_SIZE, (i + 1) * BINGO_SIZE);
        if (row.every(Boolean)) return true;
    }
    // Check columns
    for (let i = 0; i < BINGO_SIZE; i++) {
        const col = Array.from({ length: BINGO_SIZE }, (_, j) => currentCovered[j * BINGO_SIZE + i]);
        if (col.every(Boolean)) return true;
    }
    // Check diagonals
    const diag1 = Array.from({ length: BINGO_SIZE }, (_, i) => currentCovered[i * BINGO_SIZE + i]);
    if (diag1.every(Boolean)) return true;
    
    const diag2 = Array.from({ length: BINGO_SIZE }, (_, i) => currentCovered[i * BINGO_SIZE + (BINGO_SIZE - 1 - i)]);
    if (diag2.every(Boolean)) return true;

    return false;
  };

  const handleCellClick = async (index: number, streamer: Player) => {
    if (!bingoCardDocRef || !bingoCard || !firestore || !user) return;

    if (usedStreamers.has(streamer.id)) {
        toast({
            variant: "destructive",
            title: "Streamer Already Used",
            description: `You have already used ${streamer.twitchUsername}'s stream to claim a square on this card.`,
        });
        return;
    }

    const newCovered = [...bingoCard.covered];
    newCovered[index] = user.uid; // Claim with current user's ID
    
    const phrase = bingoCard.phrases[index];
    toast({
      title: 'Square Claimed!',
      description: `You claimed "${phrase}" from ${streamer.twitchUsername}'s stream.`,
    });

    onSquareClaim(user.uid);
    setUsedStreamers(prev => new Set(prev).add(streamer.id));


    const claimEventCollection = collection(firestore, 'bingoSquareClaims');
    await addDoc(claimEventCollection, {
      claimerId: user.uid,
      streamerId: streamer.id,
      phrase: phrase,
      timestamp: serverTimestamp(),
    });

    triggerDiscordUpdate();
    
    if (checkBingo(newCovered)) {
      toast({
        title: "BINGO!",
        description: "A new card will be generated shortly.",
      });
      onBingo(user.uid); // Pass the winner's ID
      
      const settingsDocRef = doc(firestore, 'gameSettings', 'default');
      updateDoc(settingsDocRef, { bingoCardsCompleted: increment(1) });

      // The Discord update will be triggered again by the score update for the bingo win
      
      // Generate a new card after a delay
      setTimeout(() => {
        setDoc(bingoCardDocRef, generateNewCardState());
      }, 5000);
    } else {
      await setDoc(bingoCardDocRef, { covered: newCovered }, { merge: true });
    }
  };

  const handleNewCard = () => {
    if (bingoCardDocRef) {
        setDoc(bingoCardDocRef, generateNewCardState());
        setUsedStreamers(new Set());
        toast({ title: "New Bingo Card Generated!" });
    }
  };


  const centerIndex = Math.floor((BINGO_SIZE * BINGO_SIZE) / 2);

  if (isLoading || !bingoCard || !allPlayers) {
    return <div className="text-center animate-pulse">Loading Bingo Card...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-5 gap-2 aspect-square">
        {bingoCard.phrases.map((phrase, index) => {
          const claimerId = bingoCard.covered[index];
          const isCovered = !!claimerId;
          const isFreeSpace = index === centerIndex;
          
          return (
            <DropdownMenu key={index}>
              <DropdownMenuTrigger asChild disabled={isCovered}>
                <div>
                  <BingoCell
                    phrase={phrase || ''}
                    isCovered={isCovered}
                    isFreeSpace={isFreeSpace}
                    claimerId={claimerId}
                    players={allPlayers}
                  />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem disabled>Who's stream?</DropdownMenuItem>
                {liveStreamers.length > 0 ? (
                  liveStreamers.map((player) => (
                    <DropdownMenuItem
                      key={player.id}
                      onClick={() => handleCellClick(index, player)}
                      disabled={usedStreamers.has(player.id)}
                    >
                      {player.twitchUsername}
                      {usedStreamers.has(player.id) && <Check className="ml-auto h-4 w-4" />}
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled>No live streams</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input 
          placeholder="Add custom phrase to center..."
          value={customPhrase}
          onChange={(e) => setCustomPhrase(e.target.value)}
          className="bg-secondary/50"
        />
        <Button onClick={handleSetCustomPhrase} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" /> Set Phrase
        </Button>
        <Button onClick={handleNewCard} variant="secondary" className="w-full sm:w-auto">
          <Shuffle className="mr-2 h-4 w-4" /> New Card
        </Button>
      </div>
    </div>
  );
}
