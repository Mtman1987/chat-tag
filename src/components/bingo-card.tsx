'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Shuffle, RefreshCw } from 'lucide-react';
import { commonBingoPhrases } from '@/lib/bingo-data';
import { BingoCell } from '@/components/bingo-cell';
import { useToast } from '@/hooks/use-toast';
import { useLiveStreamers } from '@/contexts/live-streamers-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const BINGO_SIZE = 5;

const shuffleArray = <T,>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

interface LiveStreamer {
  id: string;
  username: string;
}

interface CoveredInfo {
    userId: string;
    avatar: string;
    username: string;
}

export function BingoCard() {
  const [phrases, setPhrases] = useState<string[]>([]);
  const [covered, setCovered] = useState<Record<number, CoveredInfo>>({});
  const [customPhrase, setCustomPhrase] = useState('');
  const [currentUser, setCurrentUser] = useState({
      id: 'user_default',
      username: 'Player',
      avatar: 'https://ui-avatars.com/api/?name=Player&background=random'
  });
  const { toast } = useToast();
  const { liveStreamers } = useLiveStreamers();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch user profile on mount
  useEffect(() => {
      async function fetchUserProfile() {
          try {
              const response = await fetch('/api/user-profile');
              if (response.ok) {
                  const data = await response.json();
                  if (data.twitch) {
                      setCurrentUser({
                          id: `twitch_${data.twitch.name}`,
                          username: data.twitch.name,
                          avatar: data.twitch.avatar
                      });
                  }
              }
          } catch (e) {
              console.error('Failed to fetch user profile for bingo:', e);
          }
      }
      fetchUserProfile();
  }, []);

  const fetchState = useCallback(async () => {
      try {
          const res = await fetch('/api/bingo/state');
          if (res.ok) {
              const data = await res.json();
              if (data.bingo && data.bingo.phrases && data.bingo.phrases.length > 0) {
                  setPhrases(data.bingo.phrases);
                  setCovered(data.bingo.covered || {});
              }
          }
      } catch (e) {
          console.error('Failed to fetch bingo state', e);
          // Fallback to default phrases if API fails
          if (phrases.length === 0) {
              const shuffled = shuffleArray(commonBingoPhrases).slice(0, 24);
              shuffled.splice(12, 0, 'FREE SPACE');
              setPhrases(shuffled);
          }
      }
  }, [phrases.length]);

  useEffect(() => {
      // Initialize with default phrases immediately
      if (phrases.length === 0) {
          const shuffled = shuffleArray(commonBingoPhrases).slice(0, 24);
          shuffled.splice(12, 0, 'FREE SPACE');
          setPhrases(shuffled);
      }
      
      fetchState();

      if (intervalRef.current) {
          clearInterval(intervalRef.current);
      }

      intervalRef.current = setInterval(() => {
          fetchState();
      }, 30000);

      return () => {
          if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
          }
      };
  }, [fetchState]);

  const checkBingo = (currentCovered: Record<number, CoveredInfo>) => {
    const isCovered = (idx: number) => !!currentCovered[idx];

    for (let i = 0; i < BINGO_SIZE; i++) {
      const row = Array.from({ length: BINGO_SIZE }, (_, j) => i * BINGO_SIZE + j);
      if (row.every(isCovered)) return true;
    }
    for (let i = 0; i < BINGO_SIZE; i++) {
      const col = Array.from({ length: BINGO_SIZE }, (_, j) => j * BINGO_SIZE + i);
      if (col.every(isCovered)) return true;
    }
    const diag1 = Array.from({ length: BINGO_SIZE }, (_, i) => i * BINGO_SIZE + i);
    if (diag1.every(isCovered)) return true;
    
    const diag2 = Array.from({ length: BINGO_SIZE }, (_, i) => i * BINGO_SIZE + (BINGO_SIZE - 1 - i));
    if (diag2.every(isCovered)) return true;

    return false;
  };

  const handleCellClick = async (index: number, streamer: LiveStreamer) => {
    if (covered[index]) return;

    // Check if user already claimed a square in this stream
    const userSquaresInStream = Object.values(covered).filter(
      (square: any) => square.username === currentUser.username && square.streamerChannel === streamer.username
    );
    
    if (userSquaresInStream.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Already Claimed',
        description: `You already claimed a square in ${streamer.username}'s stream.`,
      });
      return;
    }

    const info: CoveredInfo = {
        userId: currentUser.id,
        username: currentUser.username,
        avatar: currentUser.avatar
    };

    // Optimistic update
    const newCovered = { ...covered, [index]: info };
    setCovered(newCovered);

    const phrase = phrases[index];

    // persist move
    try {
      await fetch('/api/bingo/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'claim',
            squareIndex: index,
            userId: currentUser.id,
            username: currentUser.username,
            avatar: currentUser.avatar,
            streamerChannel: streamer.username
        })
      });
      
      toast({
        title: 'Square Claimed!',
        description: `You claimed "${phrase}" from ${streamer.username}'s stream.`,
      });
    } catch (e) {
      console.warn('Failed to save bingo move', e);
    }

    if (checkBingo(newCovered)) {
      toast({
        title: "BINGO!",
        description: "You got a bingo! New card in 5 seconds.",
      });

      setTimeout(() => {
        // handleNewCard(); // Optional auto-reset
      }, 5000);
    }
  };

  const handleSetCustomPhrase = async () => {
    if (!customPhrase.trim()) return;
    const centerIndex = Math.floor((BINGO_SIZE * BINGO_SIZE) / 2);
    
    try {
        await fetch('/api/bingo/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update-phrase',
                index: centerIndex,
                phrase: customPhrase
            })
        });
        setCustomPhrase('');
        fetchState();
    } catch {}
  };

  const handleNewCard = async () => {
    toast({ title: "Generating new board...", description: "AI is creating fresh phrases" });
    
    try {
      // Call AI to generate 24 new phrases
      const aiResponse = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Generate exactly 24 short bingo phrases (2-5 words each) commonly said by Twitch streamers or heard in Twitch streams. Make them funny, relatable, and varied. Examples: "First donation hype", "Chat goes wild", "Streamer laughs hard", "Technical difficulties", "Pet appears on cam". Return ONLY the phrases as a JSON array with no other text.',
          temperature: 0.9,
          maxOutputTokens: 500
        })
      });
      
      if (!aiResponse.ok) throw new Error('AI generation failed');
      
      const aiData = await aiResponse.json();
      let newPhrases: string[] = [];
      
      // Try to parse AI response as JSON array
      try {
        const text = aiData.text || '';
        const jsonMatch = text.match(/\[.*\]/s);
        if (jsonMatch) {
          newPhrases = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // Fallback: split by newlines and clean
        newPhrases = (aiData.text || '')
          .split('\n')
          .map((line: string) => line.replace(/^[\d\-\.\*\s]+/, '').replace(/["']/g, '').trim())
          .filter((line: string) => line.length > 0 && line.length < 50)
          .slice(0, 24);
      }
      
      // Ensure we have exactly 24 phrases
      if (newPhrases.length < 24) {
        const fallback = shuffleArray(commonBingoPhrases).slice(0, 24 - newPhrases.length);
        newPhrases = [...newPhrases, ...fallback];
      }
      newPhrases = newPhrases.slice(0, 24);
      
      // Insert FREE SPACE at center
      const centerIndex = Math.floor((BINGO_SIZE * BINGO_SIZE) / 2);
      newPhrases.splice(centerIndex, 0, 'FREE SPACE');
      
      // Save to Discord
      await fetch('/api/bingo/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset',
          phrases: newPhrases
        })
      });
      
      fetchState();
      toast({ title: "New Shared Board Generated!", description: "Fresh AI-generated phrases" });
    } catch (error) {
      console.error('Failed to generate new board:', error);
      toast({ 
        variant: 'destructive',
        title: "Generation Failed", 
        description: "Using shuffled phrases instead" 
      });
      
      // Fallback to shuffle
      const shuffled = shuffleArray(commonBingoPhrases).slice(0, 24);
      const centerIndex = Math.floor((BINGO_SIZE * BINGO_SIZE) / 2);
      shuffled.splice(centerIndex, 0, 'FREE SPACE');
      
      await fetch('/api/bingo/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', phrases: shuffled })
      });
      fetchState();
    }
  };

  const centerIndex = Math.floor((BINGO_SIZE * BINGO_SIZE) / 2);

  if (phrases.length === 0) return <div>Loading Bingo Board...</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-5 gap-2 aspect-square">
        {phrases.map((phrase, index) => {
          const info = covered[index];
          const isCovered = !!info;
          const isFreeSpace = index === centerIndex;
          
          return (
            <DropdownMenu key={index}>
              <DropdownMenuTrigger asChild disabled={isCovered}>
                <div className="relative h-full w-full">
                  <BingoCell
                    phrase={phrase || ''}
                    isCovered={isCovered}
                    isFreeSpace={isFreeSpace}
                  />
                  {isCovered && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-md backdrop-blur-[1px]">
                          <Avatar className="h-8 w-8 border-2 border-white shadow-lg">
                              <AvatarImage src={info.avatar} />
                              <AvatarFallback>{info.username.charAt(0)}</AvatarFallback>
                          </Avatar>
                      </div>
                  )}
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-48 !overflow-y-auto w-56 scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200">
                <DropdownMenuItem disabled>Who's stream?</DropdownMenuItem>
                {liveStreamers.length > 0 ? (
                  liveStreamers.map((streamer) => (
                    <DropdownMenuItem
                      key={streamer.id}
                      onClick={() => handleCellClick(index, { id: streamer.id, username: streamer.username })}
                    >
                      {streamer.username}
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
          <Shuffle className="mr-2 h-4 w-4" /> New Shared Board
        </Button>
      </div>
    </div>
  );
}