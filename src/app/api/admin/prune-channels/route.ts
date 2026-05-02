import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/auth';
import { updateAppState } from '@/lib/volume-store';

export async function POST(request: NextRequest) {
  const auth = requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const result = await updateAppState((state) => {
      const playerUsernames = new Set<string>();
      for (const player of Object.values(state.tagPlayers) as any[]) {
        const username = (player.twitchUsername || '').toLowerCase();
        if (username) playerUsernames.add(username);
      }

      const before = Object.keys(state.botChannels).length;
      let pruned = 0;

      for (const channelName of Object.keys(state.botChannels)) {
        if (!playerUsernames.has(channelName.toLowerCase())) {
          delete state.botChannels[channelName];
          pruned++;
        }
      }

      return { before, after: before - pruned, pruned, players: playerUsernames.size };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
