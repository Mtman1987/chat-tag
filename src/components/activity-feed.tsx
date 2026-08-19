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
import { Bell, Gamepad2, Radio, Target } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';

type ActiveScope = {
  channel: string;
  games: Array<{ id: string; name: string; command: string }>;
};

type RecentGamePlayer = {
  id: string;
  displayName: string;
  username: string;
  gameName: string;
  score: number;
  wins: number;
  plays: number;
  gamePointsBalance: number;
  lifetimeEarned: number;
  lastActiveAt: string;
};

export function ActivityFeed() {
  const [tagEvents, setTagEvents] = useState<any[]>([]);
  const [activeScopes, setActiveScopes] = useState<ActiveScope[]>([]);
  const [gamePlayers, setGamePlayers] = useState<RecentGamePlayer[]>([]);

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
      const res = await fetch('/api/game-hub/activity', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setActiveScopes(Array.isArray(data.activeScopes) ? data.activeScopes.slice(0, 8) : []);
        setGamePlayers(Array.isArray(data.recentPlayers) ? data.recentPlayers.slice(0, 10) : []);
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

  const visibleCount = Math.min(9, tagEvents.length + gamePlayers.length + activeScopes.length);

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
      <DropdownMenuContent align="end" className="max-h-[34rem] w-[min(28rem,calc(100vw-1.5rem))] overflow-y-auto">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-emerald-300" /> Active game scopes
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {activeScopes.length > 0 ? activeScopes.map((scope) => (
          <DropdownMenuItem key={scope.channel} className="flex flex-col items-start gap-1 py-2">
            <p className="text-sm font-bold text-white">#{scope.channel}</p>
            <div className="flex flex-wrap gap-1">
              {scope.games.map((game) => (
                <span key={game.id} className="rounded-full border border-emerald-300/15 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-100" title={game.command}>
                  {game.name} · ACTIVE
                </span>
              ))}
            </div>
          </DropdownMenuItem>
        )) : <DropdownMenuItem disabled>No Games Hub scopes are active.</DropdownMenuItem>}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2">
          <Gamepad2 className="h-4 w-4 text-violet-300" /> Recent game players
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {gamePlayers.length > 0 ? gamePlayers.slice(0, 7).map((entry) => (
          <DropdownMenuItem key={entry.id} className="flex flex-col items-start gap-1 py-2">
            <p className="text-sm">
              <span className="font-bold">{entry.displayName || entry.username}</span>{' '}
              played <span className="font-bold text-violet-200">{entry.gameName}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Game score {entry.score}{entry.wins ? ` · ${entry.wins} win${entry.wins === 1 ? '' : 's'}` : ''}
              {' · '}Games Points {entry.gamePointsBalance}
              {' · '}{formatTimestamp(entry.lastActiveAt)}
            </p>
          </DropdownMenuItem>
        )) : <DropdownMenuItem disabled>No Games Hub player activity yet.</DropdownMenuItem>}

        <DropdownMenuSeparator />
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
