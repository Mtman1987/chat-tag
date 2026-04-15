
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
import { formatDistanceToNow } from 'date-fns';
import { useState, useEffect, useCallback } from 'react';

export function ActivityFeed() {
  const [tagEvents, setTagEvents] = useState<any[]>([]);
  const [bingoEvents, setBingoEvents] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/tag', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const history = (data.history || []).filter((e: any) => !e.blocked).slice(0, 10);
        setTagEvents(history);
      }
    } catch {}
    try {
      const res = await fetch('/api/bingo/state', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setBingoEvents((data.bingo?.recentClaims || []).slice(0, 10));
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const ts = (value: any): number => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const formatTimestamp = (value: any) => {
    const ms = ts(value);
    if (!ms) return 'Just now';
    return formatDistanceToNow(new Date(ms), { addSuffix: true });
  };

  const latestTag = tagEvents[0];

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <Trophy className="mr-2 h-4 w-4 text-yellow-400" />
            <span>{bingoEvents.length > 0 ? 'Bingo Activity' : 'Bingo Events'}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>Latest Bingo Events</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {bingoEvents.length > 0 ? (
            bingoEvents.map((event: any, i: number) => (
              <DropdownMenuItem key={i} className="flex flex-col items-start gap-1">
                <p><span className="font-bold">{event.username || 'Someone'}</span> claimed square {event.squareIndex}</p>
                <p className="text-xs text-muted-foreground">{formatTimestamp(event.timestamp)}</p>
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
              {latestTag
                ? `${latestTag.taggerUsername || 'Someone'} tagged ${latestTag.taggedUsername || 'someone'}`
                : 'Latest Tags'}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>Latest Tag Events</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {tagEvents.length > 0 ? (
            tagEvents.map((event: any, i: number) => (
              <DropdownMenuItem key={i} className="flex flex-col items-start gap-1">
                <p>
                  <span className="font-bold">{event.taggerUsername || event.taggerId}</span> tagged{' '}
                  <span className="font-bold">{event.taggedUsername || event.taggedId}</span>
                  {event.streamerId && <span className="text-muted-foreground"> in {event.streamerId}</span>}
                  {event.doublePoints && <span className="text-yellow-500 font-bold"> (2x!)</span>}
                </p>
                <p className="text-xs text-muted-foreground">{formatTimestamp(event.timestamp)}</p>
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
