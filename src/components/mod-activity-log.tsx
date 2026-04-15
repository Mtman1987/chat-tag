'use client';

import { useState, useEffect, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface ModEntry {
  id: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
  channel: string;
  timestamp: number;
  source: string;
}

const ACTION_ICONS: Record<string, string> = {
  'grant-pass': '🎟️',
  'tag': '🎯',
  'set-it': '🔴',
  'auto-rotate': '🔄',
  'sleep': '😴',
  'wake': '☀️',
  'join': '➕',
  'leave': '➖',
  'clear-away': '🧹',
  'clear-all-away': '🧹',
  'use-pass': '🎟️',
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h ago`;
}

export function ModActivityLog() {
  const [entries, setEntries] = useState<ModEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tag/mod-log', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch (e) {
      console.error('Failed to fetch mod log', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLog();
    const interval = setInterval(fetchLog, 30000);
    return () => clearInterval(interval);
  }, [fetchLog]);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-headline text-lg">Mod Activity Log</h3>
        <Button variant="ghost" size="icon" onClick={fetchLog} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Everything mods and the system did — tags, passes, sleep/wake, rotations.
      </p>
      <ScrollArea className="h-[32rem] rounded-md border">
        <div className="p-4 space-y-2">
          {entries.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No activity yet</p>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 text-sm border-b pb-2">
                <span className="text-lg leading-none mt-0.5">
                  {ACTION_ICONS[entry.action] || '📋'}
                </span>
                <div className="flex-1 min-w-0">
                  <div>
                    <span className="font-medium">{entry.actor}</span>{' '}
                    <span className="text-muted-foreground">{entry.action}</span>{' '}
                    {entry.target && <span className="font-medium">{entry.target}</span>}
                  </div>
                  {entry.detail && (
                    <div className="text-muted-foreground text-xs truncate">{entry.detail}</div>
                  )}
                  {entry.channel && (
                    <div className="text-muted-foreground text-xs">in {entry.channel}</div>
                  )}
                </div>
                <span className="text-muted-foreground text-xs whitespace-nowrap">
                  {timeAgo(entry.timestamp)}
                </span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
