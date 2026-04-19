import { NextRequest, NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';

export async function GET(_req: NextRequest) {
  try {
    const state = await readAppState();
    const blacklist = new Set(
      (state.botSettings.blacklistedChannels.channels || []).map((c: string) => c.toLowerCase())
    );
    const joinedChannels = new Set(
      (state.botRuntime.joinedChannels || []).map((c: string) => c.toLowerCase())
    );

    // Derive channel list from tagPlayers as the single source of truth
    const playerChannels = new Set<string>();
    for (const player of Object.values(state.tagPlayers) as any[]) {
      const username = (player.twitchUsername || '').toLowerCase();
      if (username && !blacklist.has(username)) {
        playerChannels.add(username);
      }
    }

    // Also include any botChannels entries not yet in tagPlayers (legacy/pending)
    for (const ch of Object.keys(state.botChannels)) {
      if (!blacklist.has(ch.toLowerCase())) {
        playerChannels.add(ch.toLowerCase());
      }
    }

    const channels = Array.from(playerChannels).map((name) => ({
      name,
      status: joinedChannels.has(name) ? 'joined' : state.botChannels[name]?.status || 'pending',
    }));

    return NextResponse.json({ channels });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
