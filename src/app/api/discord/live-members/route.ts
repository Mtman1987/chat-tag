import { NextResponse } from 'next/server';
import { readAppState, updateAppStateIfChanged } from '@/lib/volume-store';
import { fetchTwitchLiveData } from '@/lib/twitch-live-data';

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^@+/, '');
}

export async function GET() {
  try {
    const state = await readAppState();
    const blacklisted = new Set(
      (state.botSettings?.blacklistedChannels?.channels || []).map((channel: string) => normalize(channel))
    );

    // Chat Tag's registered game-player list is the source of truth for player
    // live checks. Discord members and joined bot channels are not substitutes:
    // either can contain people who are not registered players or omit players.
    const players = Object.values(state.tagPlayers || {}) as any[];
    const playerByTwitch = new Map<string, any>();
    for (const player of players) {
      const username = normalize(player?.twitchUsername || player?.username);
      if (!username || blacklisted.has(username) || playerByTwitch.has(username)) continue;
      playerByTwitch.set(username, player);
    }

    const channels = [...playerByTwitch.keys()];
    if (channels.length === 0) {
      return NextResponse.json({
        liveMembers: [],
        allMembers: [],
        rosterSource: 'tag-players',
        rosterCount: 0,
      });
    }

    // Discord sync is metadata only; it must never decide who is checked.
    const discordByTwitch = new Map<string, any>();
    for (const raw of Object.values(state.users || {}) as any[]) {
      const username = normalize(raw?.twitchUsername || raw?.discordUsername || raw?.username);
      if (username && !discordByTwitch.has(username)) discordByTwitch.set(username, raw);
    }

    // Never hold the shared volume write lock while waiting on Twitch.
    const { liveUsers, allUsers } = await fetchTwitchLiveData(channels);

    const liveMembers = (liveUsers || [])
      .filter((user: any) => {
        const username = normalize(user.login || user.username);
        return username && playerByTwitch.has(username) && !blacklisted.has(username);
      })
      .map((user: any, index: number) => {
        const twitchUsername = normalize(user.login || user.username);
        const player = playerByTwitch.get(twitchUsername) || {};
        const discordMember = discordByTwitch.get(twitchUsername) || {};
        return {
          discordId: discordMember.discordId || user.id || `live-${index}`,
          discordUsername: discordMember.discordUsername || discordMember.username || user.username || user.login,
          discordDisplayName: discordMember.discordDisplayName || discordMember.displayName || discordMember.discordUsername || player.displayName || user.displayName || user.display_name || user.username,
          twitchUsername: user.login || user.username,
          twitchDisplayName: user.displayName || user.display_name || player.displayName || user.username,
          streamTitle: user.title || '',
          gameName: user.gameName || user.game_name || '',
          viewerCount: user.viewerCount ?? user.viewer_count ?? 0,
          thumbnailUrl: user.thumbnailUrl || user.thumbnail_url || '',
          streamStartedAt: user.startedAt || user.started_at || null,
          isSharedChat: Boolean(user.isSharedChat),
          sharedSessionId: user.sharedSessionId || null,
          isSharedHost: Boolean(user.isSharedHost),
          sharedWith: user.sharedWith || [],
        };
      });

    const liveUsernames = new Set(liveMembers.map((member: any) => normalize(member.twitchUsername)));
    if (liveUsernames.size > 0) {
      await updateAppStateIfChanged((draft) => {
        let changed = false;
        for (const player of Object.values(draft.tagPlayers || {}) as any[]) {
          const username = normalize(player.twitchUsername || player.username);
          if (liveUsernames.has(username) && (
            player.offlineImmunity || player.sleepingImmunity
          )) {
            player.offlineImmunity = false;
            player.sleepingImmunity = false;
            changed = true;
          }
        }
        return { changed, result: null };
      });
    }

    return NextResponse.json({
      liveMembers,
      allMembers: allUsers || [],
      rosterSource: 'tag-players',
      rosterCount: channels.length,
    });
  } catch (error) {
    console.error('[Live Members] Failed to check registered player roster:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
