'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface LiveStreamer {
  id: string;
  username: string;
  avatar?: string;
  isActive: boolean;
  isSharedChat?: boolean;
  sharedWith?: string[];
  sharedSessionId?: string | null;
}

interface LiveStreamersContextType {
  liveStreamers: LiveStreamer[];
  allCommunityMembers: LiveStreamer[];
  refreshStreamers: () => Promise<void>;
  isLoading: boolean;
}

const LiveStreamersContext = createContext<LiveStreamersContextType | undefined>(undefined);

export function LiveStreamersProvider({ children }: { children: ReactNode }) {
  const [liveStreamers, setLiveStreamers] = useState<LiveStreamer[]>([]);
  const [allCommunityMembers, setAllCommunityMembers] = useState<LiveStreamer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStreamers = useCallback(async () => {
    try {
      const response = await fetch('/api/discord/live-members', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      const liveMembers: any[] = Array.isArray(data?.liveMembers) ? data.liveMembers : [];
      const allMembers: any[] = Array.isArray(data?.allMembers) ? data.allMembers : [];

      const liveByUsername = new Map(
        liveMembers
          .map((member) => [String(member?.twitchUsername || member?.username || '').toLowerCase(), member] as const)
          .filter(([username]) => Boolean(username)),
      );
      const seen = new Set<string>();

      const communityMembers = allMembers.reduce<LiveStreamer[]>((members, member) => {
        const username = String(member?.username || member?.login || '').trim().toLowerCase();
        if (!username) return members;
        seen.add(username);
        const live = liveByUsername.get(username);
        members.push({
          id: String(member?.id || live?.discordId || username),
          username,
          avatar: member?.profile_image_url || member?.avatar || undefined,
          isActive: Boolean(live),
          isSharedChat: Boolean(live?.isSharedChat),
          sharedWith: Array.isArray(live?.sharedWith) ? live.sharedWith : [],
          sharedSessionId: live?.sharedSessionId || null,
        });
        return members;
      }, []);

      for (const live of liveMembers) {
        const username = String(live?.twitchUsername || live?.username || '').trim().toLowerCase();
        if (!username || seen.has(username)) continue;
        communityMembers.push({
          id: String(live?.discordId || live?.id || username),
          username,
          avatar: live?.profile_image_url || live?.avatar || undefined,
          isActive: true,
          isSharedChat: Boolean(live?.isSharedChat),
          sharedWith: Array.isArray(live?.sharedWith) ? live.sharedWith : [],
          sharedSessionId: live?.sharedSessionId || null,
        });
      }

      communityMembers.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.username.localeCompare(b.username));
      setAllCommunityMembers(communityMembers);
      setLiveStreamers(communityMembers.filter((member) => member.isActive));
    } catch (error) {
      console.error('Failed to fetch community live roster:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStreamers();
    const interval = window.setInterval(() => void fetchStreamers(), 60_000);
    const onFocus = () => void fetchStreamers();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchStreamers]);

  return (
    <LiveStreamersContext.Provider value={{
      liveStreamers,
      allCommunityMembers,
      refreshStreamers: fetchStreamers,
      isLoading,
    }}>
      {children}
    </LiveStreamersContext.Provider>
  );
}

export function useLiveStreamers() {
  const context = useContext(LiveStreamersContext);
  if (context === undefined) {
    throw new Error('useLiveStreamers must be used within a LiveStreamersProvider');
  }
  return context;
}
