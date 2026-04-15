import { NextRequest, NextResponse } from 'next/server';
import { updateAppState } from '@/lib/volume-store';

export async function GET(_request: NextRequest) {
  try {
    const result = await updateAppState(async (state) => {
      const channels = Object.keys(state.botChannels);

      if (channels.length === 0) {
        return { liveMembers: [], allMembers: [] };
      }

      const liveResponse = await fetch(`${process.env.INTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/twitch/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: channels }),
      });

      if (!liveResponse.ok) {
        return { status: 500, error: 'Failed to check live status' };
      }

      const { liveUsers, allUsers } = await liveResponse.json();

      const liveMembers = (liveUsers || []).map((user: any, index: number) => ({
        discordId: user.id || `live-${index}`,
        discordUsername: user.username || user.login,
        discordDisplayName: user.displayName || user.display_name || user.username,
        twitchUsername: user.login || user.username,
        twitchDisplayName: user.display_name || user.displayName || user.username,
        streamTitle: user.title || '',
        gameName: user.game_name || '',
        viewerCount: user.viewer_count || 0,
        thumbnailUrl: user.thumbnail_url || '',
        isSharedChat: Boolean(user.isSharedChat),
        sharedSessionId: user.sharedSessionId || null,
        isSharedHost: Boolean(user.isSharedHost),
        sharedWith: user.sharedWith || [],
      }));

      const liveUsernames = new Set(liveMembers.map((m: any) => String(m.twitchUsername || '').toLowerCase()));
      for (const player of Object.values(state.tagPlayers) as any[]) {
        const username = String(player.twitchUsername || '').toLowerCase();
        if (liveUsernames.has(username)) {
          player.offlineImmunity = false;
          player.sleepingImmunity = false;
          player.timedImmunityUntil = null;
          player.noTagbackFrom = null;
        }
      }

      return { liveMembers, allMembers: allUsers || [] };
    });

    if ((result as any).error) {
      return NextResponse.json({ error: (result as any).error }, { status: (result as any).status || 500 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
