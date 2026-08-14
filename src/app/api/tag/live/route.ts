import { NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';
import { fetchTwitchLiveData } from '@/lib/twitch-live-data';

export const dynamic = 'force-dynamic';

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^@+/, '');
}

export async function GET() {
  try {
    const state = await readAppState();
    const blacklisted = new Set(
      (state.botSettings?.blacklistedChannels?.channels || []).map((channel: string) => normalize(channel))
    );
    const players = Object.values(state.tagPlayers || {}) as any[];
    const eligible = players.filter((player) => {
      const username = normalize(player?.twitchUsername || player?.username);
      return username && !player?.optedOut && !blacklisted.has(username);
    });
    const usernames = [...new Set(eligible.map((player) => normalize(player?.twitchUsername || player?.username)).filter(Boolean))];
    if (!usernames.length) {
      return NextResponse.json({ livePlayers: [], liveCount: 0, totalPlayers: 0, command: 'spmt live' });
    }

    const { liveUsers = [] } = await fetchTwitchLiveData(usernames);
    const streams = new Map<string, any>();
    for (const user of liveUsers as any[]) {
      const username = normalize(user?.login || user?.username);
      if (username) streams.set(username, user);
    }

    const livePlayers = eligible.flatMap((player) => {
      const username = normalize(player?.twitchUsername || player?.username);
      const stream = streams.get(username);
      if (!stream) return [];
      return [{
        id: player.id || null,
        twitchUsername: username,
        displayName: player.displayName || player.twitchUsername || player.username || username,
        isIt: Boolean(player.isIt),
        streamTitle: stream.title || '',
        gameName: stream.game_name || '',
        viewerCount: Number(stream.viewer_count || 0),
        startedAt: stream.started_at || stream.startedAt || null,
      }];
    });

    return NextResponse.json({
      livePlayers,
      liveCount: livePlayers.length,
      totalPlayers: eligible.length,
      command: 'spmt live',
    });
  } catch (error) {
    console.error('[ChatTag live players] Error:', error);
    return NextResponse.json({ error: 'Unable to read live Chat Tag players.' }, { status: 500 });
  }
}
