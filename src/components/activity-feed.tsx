
'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from './ui/button';
import { Trophy, Target } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import type { Player } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { useMemo } from 'react';

type ChatTagEvent = {
  id: string;
  taggerId: string;
  taggedId: string;
  streamerId: string;
  timestamp: {
    seconds: number;
    nanoseconds: number;
  } | null;
};

type BingoWinEvent = {
  id: string;
  userId: string;
  points: number;
  timestamp: {
    seconds: number;
    nanoseconds: number;
  } | null;
};

type BingoSquareClaimEvent = {
  id: string;
  claimerId: string;
  streamerId: string;
  phrase: string;
  timestamp: {
    seconds: number;
    nanoseconds: number;
  } | null;
};

type CombinedBingoEvent = {
  id: string;
  type: 'win' | 'claim';
  timestamp: Date;
  content: JSX.Element;
};

export function ActivityFeed() {
  const firestore = useFirestore();
  
  const playersCollection = useMemoFirebase(
    () => (firestore ? collection(firestore, 'users') : null),
    [firestore]
  );
  
  const chatTagsQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'chatTags'), orderBy('timestamp', 'desc'), limit(10)) : null),
    [firestore]
  );

  const bingoWinsQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'bingoEvents'), orderBy('timestamp', 'desc'), limit(10)) : null),
    [firestore]
  );
  
  const bingoClaimsQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'bingoSquareClaims'), orderBy('timestamp', 'desc'), limit(10)) : null),
    [firestore]
  );

  const { data: players } = useCollection<Player>(playersCollection);
  const { data: tagEvents } = useCollection<ChatTagEvent>(chatTagsQuery);
  const { data: bingoWinEvents } = useCollection<BingoWinEvent>(bingoWinsQuery);
  const { data: claimEvents } = useCollection<BingoSquareClaimEvent>(bingoClaimsQuery);

  const getPlayerName = (id: string) => players?.find(p => p.id === id)?.twitchUsername || 'A player';

  const formatTimestamp = (timestamp: Date | null) => {
    if (!timestamp) return 'Just now';
    return formatDistanceToNow(timestamp, { addSuffix: true });
  };
  
  const combinedBingoEvents = useMemo(() => {
    const wins: CombinedBingoEvent[] = (bingoWinEvents || []).map(event => ({
      id: event.id,
      type: 'win',
      timestamp: event.timestamp ? new Date(event.timestamp.seconds * 1000) : new Date(),
      content: (
        <p>
          <span className="font-bold">{getPlayerName(event.userId)}</span> got Bingo for{' '}
          <span className="font-semibold text-primary">{event.points}</span> points!
        </p>
      ),
    }));

    const claims: CombinedBingoEvent[] = (claimEvents || []).map(event => ({
      id: event.id,
      type: 'claim',
      timestamp: event.timestamp ? new Date(event.timestamp.seconds * 1000) : new Date(),
      content: (
         <p>
          <span className="font-bold">{getPlayerName(event.claimerId)}</span> claimed "{event.phrase}" in{' '}
          <span className="font-semibold">{getPlayerName(event.streamerId)}'s</span> stream.
        </p>
      ),
    }));

    return [...wins, ...claims].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  }, [bingoWinEvents, claimEvents, players]);


  const latestTagEvent = tagEvents?.[0];
  const latestBingoEvent = combinedBingoEvents?.[0];

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <Trophy className="mr-2 h-4 w-4 text-yellow-400" />
            <span>
              {latestBingoEvent?.type === 'win' && `New Bingo Winner!`}
              {latestBingoEvent?.type === 'claim' && `New Bingo Claim!`}
              {!latestBingoEvent && 'Bingo Events'}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>Latest Bingo Events</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {combinedBingoEvents && combinedBingoEvents.length > 0 ? (
            combinedBingoEvents.slice(0, 10).map(event => (
              <DropdownMenuItem key={event.id} className="flex flex-col items-start gap-1">
                {event.content}
                <p className="text-xs text-muted-foreground">
                  {formatTimestamp(event.timestamp)}
                </p>
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>No bingo events yet.</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <Target className="mr-2 h-4 w-4 text-primary" />
            <span>
              {latestTagEvent
                ? `${getPlayerName(latestTagEvent.taggerId)} tagged ${getPlayerName(latestTagEvent.taggedId)}`
                : 'Latest Tags'}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>Latest Tag Events</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {tagEvents && tagEvents.length > 0 ? (
            tagEvents.map(event => (
              <DropdownMenuItem key={event.id} className="flex flex-col items-start gap-1">
                <p>
                  <span className="font-bold">{getPlayerName(event.taggerId)}</span> tagged{' '}
                  <span className="font-bold">{getPlayerName(event.taggedId)}</span> in{' '}
                  <span className="font-semibold">{getPlayerName(event.streamerId)}'s</span> stream.
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatTimestamp(event.timestamp ? new Date(event.timestamp.seconds * 1000) : null)}
                </p>
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>No tag events yet.</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
