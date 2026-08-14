import { NextResponse } from 'next/server';
import { updateAppState } from '@/lib/volume-store';
import { fetchTwitchLiveData } from '@/lib/twitch-live-data';

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^@+/, '');
}

export async function GET() {
  try {
    const result = await updateAppState(async (state) => {
      const blacklisted = new Set(
        (state.botSettings?.blacklistedChannels?.channels || []).map((channel: string) => normalize(channel))
      );

      // Discord sync stores guild members in state.users. Prefer that roster so
      // MountainView's generic “who's live?” command means everyone we know from
      // Discord, not only channels that happen to be joined by the Chat Tag bot.
      const discordMembers = Object.values(state.users || {})
        .map((raw: any) => ({
          ...raw,
          twitchUsername: normalize(raw?.twitchUsername || raw?.discordUsername || raw?.username || raw?.id),
        }))
        .filter((member: any) =>
          member.twitchUsername &&
          !blacklisted.has(member.twitchUsername) &&
          Boolean(member.discordId || member.discordUsername)
        );

      const discordByTwitch = new Map<string, any>();
      for (const member of discordMembers) {
        if (!discordByTwitch.has(member.twitchUsername)) {
          discordByTwitch.set(member.twitchUsername, member);
        }
      }

      // Keep the legacy/manual channel roster as a fallback for installations
      // that have not run Discord sync yet, without narrowing a synced guild.
      const channels = discordMembers.length > 0
        ? [...discordByTwitch.keys()]
        : Object.keys(state.botChannels || {})
            .map(normalize)
            .filter((channel) => channel && !blacklisted.has(channel));

      if (channels.length === 0) {
        return { liveMembers: [], allMembers: [], rosterSource: 'discord' };
      }

      const { liveUsers, allUsers } = await fetchTwitchLiveData(channels);

      const liveMembers = (liveUsers || []).map((user: any, index: number) => {
        const twitchUsername = normalize(user.login || user.username);
        const discordMember = discordByTwitch.get(twitchUsername) || {};
        return {
          discordId: discordMember.discordId || user.id || `live-${index}`,
          discordUsername: discordMember.discordUsername || discordMember.username || user.username || user.login,
          discordDisplayName: discordMember.discordDisplayName || discordMember.displayName || discordMember.discordUsername || user.displayName || user.display_name || user.username,
          twitchUsername: user.login || user.username,
          twitchDisplayName: user.display_name || user.displayName || user.username,
          streamTitle: user.title || '',
          gameName: user.game_name || '',
          viewerCount: user.viewer_count || 0,
          thumbnailUrl: user.thumbnail_url || '',
          streamStartedAt: user.startedAt || user.started_at || null,
          isSharedChat: Boolean(user.isSharedChat),
          sharedSessionId: user.sharedSessionId || null,
          isSharedHost: Boolean(user.isSharedHost),
          sharedWith: user.sharedWith || [],
        };
      });

      const liveUsernames = new Set(liveMembers.map((member: any) => normalize(member.twitchUsername)));
      for (const player of Object.values(state.tagPlayers || {}) as any[]) {
        const username = normalize(player.twitchUsername || player.username);
        if (liveUsernames.has(username)) {
          player.offlineImmunity = false;
          player.sleepingImmunity = false;
          player.timedImmunityUntil = null;
          player.noTagbackFrom = null;
        }
      }

      return {
        liveMembers,
        allMembers: allUsers || [],
        rosterSource: discordMembers.length > 0 ? 'discord' : 'legacy-bot-channels',
        rosterCount: channels.length,
      };
    });

    if ((result as any).error) {
      return NextResponse.json({ error: (result as any).error }, { status: (result as any).status || 500 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
