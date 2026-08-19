'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Shuffle } from 'lucide-react';
import { commonBingoPhrases } from '@/lib/bingo-data';
import { BingoCell } from '@/components/bingo-cell';
import { useToast } from '@/hooks/use-toast';
import { useLiveStreamers } from '@/contexts/live-streamers-context';
import { useSession } from '@/contexts/session-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const BINGO_SIZE = 5;
const FREE_SPACE_INDEX = 12;

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
  streamerChannel?: string;
}

export function BingoCard() {
  const [phrases, setPhrases] = useState<string[]>([]);
  const [covered, setCovered] = useState<Record<number, CoveredInfo>>({});
  const [customPhrase, setCustomPhrase] = useState('');
  const [customSquareIndex, setCustomSquareIndex] = useState(0);
  const { toast } = useToast();
  const { liveStreamers } = useLiveStreamers();
  const { user } = useSession();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentUser = {
    id: user?.twitchUsername ? `twitch_${user.twitchUsername}` : 'anonymous',
    username: user?.twitchUsername || 'Player',
    avatar: user?.avatarUrl || 'https://ui-avatars.com/api/?name=Player&background=random',
  };

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/bingo/state', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.bingo && data.bingo.phrases && data.bingo.phrases.length > 0) {
          setPhrases(data.bingo.phrases);
          setCovered(data.bingo.covered || {});
        }
      }
    } catch (e) {
      console.error('Failed to fetch bingo state', e);
      setPhrases((current) => {
        if (current.length > 0) return current;
        const shuffled = shuffleArray(commonBingoPhrases).slice(0, 24);
        shuffled.splice(FREE_SPACE_INDEX, 0, 'FREE SPACE');
        return shuffled;
      });
    }
  }, []);

  useEffect(() => {
    if (phrases.length === 0) {
      const shuffled = shuffleArray(commonBingoPhrases).slice(0, 24);
      shuffled.splice(FREE_SPACE_INDEX, 0, 'FREE SPACE');
      setPhrases(shuffled);
    }

    void fetchState();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => void fetchState(), 30_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchState, phrases.length]);

  const handleCellClick = async (index: number, streamer: LiveStreamer) => {
    if (index === FREE_SPACE_INDEX || covered[index]) return;

    const userSquaresInStream = Object.values(covered).filter(
      (square) => square.username?.toLowerCase() === currentUser.username.toLowerCase()
        && square.streamerChannel?.toLowerCase() === streamer.username.toLowerCase()
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
      avatar: currentUser.avatar,
      streamerChannel: streamer.username,
    };
    const previousCovered = covered;
    setCovered({ ...covered, [index]: info });
    const phrase = phrases[index];

    try {
      const response = await fetch('/api/bingo/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'claim',
          squareIndex: index,
          streamerChannel: streamer.username,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Bingo claim failed.');

      toast({
        title: body.bingo ? 'BINGO!' : 'Square Claimed!',
        description: body.bingo
          ? `You completed a line after spotting "${phrase}" in ${streamer.username}.`
          : `You claimed "${phrase}" from ${streamer.username}'s stream.`,
      });
      await fetchState();
    } catch (error: any) {
      setCovered(previousCovered);
      toast({
        variant: 'destructive',
        title: 'Claim rejected',
        description: error?.message || 'The Bingo square could not be claimed.',
      });
    }
  };

  const handleSetCustomPhrase = async () => {
    if (!user?.isAdmin || !customPhrase.trim() || customSquareIndex === FREE_SPACE_INDEX) return;
    try {
      const response = await fetch('/api/bingo/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-phrase',
          index: customSquareIndex,
          phrase: customPhrase,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Phrase update failed.');
      setCustomPhrase('');
      await fetchState();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Phrase update failed', description: error?.message || 'Could not update the square.' });
    }
  };

  const handleNewCard = async () => {
    if (!user?.isAdmin) return;
    toast({ title: 'Generating new board...', description: 'Creating fresh shared Bingo phrases.' });

    try {
      const res = await fetch('/api/bingo/generate', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      await fetchState();
      toast({
        title: 'New Shared Board Generated!',
        description: data.aiGenerated ? 'Fresh AI-generated phrases' : 'Shuffled phrases (AI unavailable)',
      });
    } catch (error: any) {
      console.error('Failed to generate new board:', error);
      toast({
        variant: 'destructive',
        title: 'Generation Failed',
        description: error?.message || 'Could not create new board',
      });
    }
  };

  if (phrases.length === 0) return <div>Loading Bingo Board...</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid aspect-square grid-cols-5 gap-2">
        {phrases.map((phrase, index) => {
          const info = covered[index];
          const isCovered = Boolean(info);
          const isFreeSpace = index === FREE_SPACE_INDEX;

          return (
            <DropdownMenu key={index}>
              <DropdownMenuTrigger asChild disabled={isCovered || isFreeSpace}>
                <div className="relative h-full w-full">
                  <BingoCell
                    phrase={phrase || ''}
                    isCovered={isCovered}
                    isFreeSpace={isFreeSpace}
                  />
                  {isCovered && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40 backdrop-blur-[1px]">
                      <Avatar className="h-8 w-8 border-2 border-white shadow-lg">
                        <AvatarImage src={info.avatar} />
                        <AvatarFallback>{info.username.charAt(0)}</AvatarFallback>
                      </Avatar>
                    </div>
                  )}
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-48 w-56 !overflow-y-auto scrollbar-thin scrollbar-track-gray-200 scrollbar-thumb-gray-400">
                <DropdownMenuItem disabled>Whose stream?</DropdownMenuItem>
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

      {user?.isAdmin && (
        <div className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-[150px_1fr_auto_auto]">
          <select
            value={customSquareIndex}
            onChange={(event) => setCustomSquareIndex(Number(event.target.value))}
            className="rounded-md border border-white/10 bg-slate-950 px-2 text-sm text-white"
            aria-label="Bingo square to edit"
          >
            {phrases.map((phrase, index) => index === FREE_SPACE_INDEX ? null : (
              <option key={index} value={index}>Square {index + 1}</option>
            ))}
          </select>
          <Input
            placeholder="Replace selected square phrase..."
            value={customPhrase}
            onChange={(event) => setCustomPhrase(event.target.value)}
            className="bg-secondary/50"
          />
          <Button onClick={handleSetCustomPhrase}>
            <Plus className="mr-2 h-4 w-4" /> Set Phrase
          </Button>
          <Button onClick={handleNewCard} variant="secondary">
            <Shuffle className="mr-2 h-4 w-4" /> New Board
          </Button>
        </div>
      )}
    </div>
  );
}
