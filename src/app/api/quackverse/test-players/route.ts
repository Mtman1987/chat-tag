import { NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const state = await readAppState();
  const players = Object.values(state.tagPlayers || {})
    .map((player: any) => ({
      id: String(player.id || ''),
      twitchUsername: String(player.twitchUsername || player.username || player.id || ''),
      avatarUrl: String(player.avatarUrl || player.avatar || ''),
      score: Number(player.score || 0),
      tags: Number(player.tags || 0),
      tagged: Number(player.tagged || 0),
    }))
    .filter((player) => player.id && player.twitchUsername)
    .sort((a, b) => a.twitchUsername.localeCompare(b.twitchUsername));

  return NextResponse.json({ players });
}
