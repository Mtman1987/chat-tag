import { NextRequest, NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';

export async function GET(_req: NextRequest) {
  try {
    const state = await readAppState();

    const counts = state.pinTags.pinscorpion6521.counts || {};
    const playerMap: Record<string, string> = {};

    for (const [id, player] of Object.entries(state.tagPlayers)) {
      playerMap[id] = (player as any).twitchUsername || (player as any).username || id;
    }

    const topTagged = Object.entries(counts)
      .map(([userId, count]) => ({
        userId,
        username: playerMap[userId] || userId,
        count: count as number,
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ topTagged });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}