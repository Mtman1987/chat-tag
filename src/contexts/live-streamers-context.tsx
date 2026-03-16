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
      const channelsRes = await fetch('/api/bot/channels');
      if (!channelsRes.ok) return;

      const { channels } = await channelsRes.json();
      const channelNames = Array.isArray(channels) 
        ? channels.map(c => typeof c === 'string' ? c : c.name)
        : [];
      
      if (channelNames.length === 0) {
        setLiveStreamers([]);
        setAllCommunityMembers([]);
        return;
      }

      const liveRes = await fetch('/api/twitch/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: channelNames })
      });

      if (liveRes.ok) {
        const { liveUsers, allUsers } = await liveRes.json();
        const safeAllUsers = allUsers || [];
        const safeLiveUsers = liveUsers || [];

        const communityMembers: LiveStreamer[] = channelNames.map((channelName: string) => {
          let twitchUser = safeAllUsers.find((u: any) => u?.username?.toLowerCase() === channelName?.toLowerCase());
          if (!twitchUser) {
            twitchUser = safeLiveUsers.find((u: any) => u?.username?.toLowerCase() === channelName?.toLowerCase());
          }
          const isLive = safeLiveUsers.some((s: any) => s?.username?.toLowerCase() === channelName?.toLowerCase());
          const avatar = twitchUser?.profile_image_url || `https://ui-avatars.com/api/?name=${channelName}&background=random`;
          
          return {
            id: channelName,
            username: twitchUser?.displayName || channelName,
            avatar,
            isActive: isLive,
            isSharedChat: Boolean(twitchUser?.isSharedChat),
            sharedWith: twitchUser?.sharedWith || [],
            sharedSessionId: twitchUser?.sharedSessionId || null,
          };
        });

        setAllCommunityMembers(communityMembers);
        setLiveStreamers(communityMembers.filter(m => m.isActive));
      }
    } catch (error) {
      console.error('Failed to fetch streamers:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStreamers();
    const interval = setInterval(fetchStreamers, 600000);
    return () => clearInterval(interval);
  }, [fetchStreamers]);

  return (
    <LiveStreamersContext.Provider value={{
      liveStreamers,
      allCommunityMembers,
      refreshStreamers: fetchStreamers,
      isLoading
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
