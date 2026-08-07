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
import { Bell, Target, Trophy } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';

export function ActivityFeed() {
  const [tagEvents, setTagEvents] = useState<any[]>([]);
  const [bingoEvents, setBingoEvents] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/tag', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const history = (data.history || []).filter((event: any) => !event.blocked).slice(0, 8);
        setTagEvents(history);
      }
    } catch {}

    try {
      const res = await fetch('/api/bingo/state', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setBingoEvents((data.bingo?.recentClaims || []).slice(0, 8));
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const timestamp = (value: any): number => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const formatTimestamp = (value: any) => {
    const milliseconds = timestamp(value);
    if (!milliseconds) return 'Just now';
    return formatDistanceToNow(new Date(milliseconds), { addSuffix: true });
  };

  const visibleCount = Math.min(9, tagEvents.length + bingoEvents.length);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 text-slate-200 hover:bg-white/10 hover:text-white"
        >
          <Bell className="h-4 w-4" />
          <span className="ml-2 hidden sm:inline">Activity</span>
          {visibleCount > 0 && (
            <span className="ml-2 rounded-full bg-cyan-300/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-cyan-100">
              {visibleCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[28rem] w-[min(24rem,calc(100vw-1.5rem))] overflow-y-auto">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Target className="h-4 w-4 text-cyan-300" /> Recent Tags
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tagEvents.length > 0 ? (
          tagEvents.slice(0, 5).map((event: any, index: number) => (
            <DropdownMenuItem key={event.id || event.messageId || `tag-${index}`} className="flex flex-col items-start gap-1 py-2">
              <p className="text-sm">
                <span className="font-bold">{event.taggerUsername || event.taggerId || 'Someone'}</span> tagged{' '}
                <span className="font-bold">{event.taggedUsername || event.taggedId || 'someone'}</span>
                {event.doublePoints && <span className="font-bold text-yellow-500"> (2x)</span>}
              </p>
              <p className="text-xs text-muted-foreground">{formatTimestamp(event.timestamp)}</p>
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>No tag events yet.</DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-yellow-400" /> Recent Bingo
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {bingoEvents.length > 0 ? (
          bingoEvents.slice(0, 5).map((event: any, index: number) => (
            <DropdownMenuItem key={event.id || `bingo-${index}`} className="flex flex-col items-start gap-1 py-2">
              <p className="text-sm">
                <span className="font-bold">{event.username || 'Someone'}</span> claimed square {event.squareIndex}
              </p>
              <p className="text-xs text-muted-foreground">{formatTimestamp(event.timestamp)}</p>
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>No bingo events yet.</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
