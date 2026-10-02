import { NextRequest, NextResponse } from 'next/server';
import { isBotRequest } from '@/lib/auth';
import { stopInactiveChannelGames } from '@/lib/game-hub-state';
import { updateAppStateIfChanged } from '@/lib/volume-store';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  if (!isBotRequest(req)) return NextResponse.json({ error: 'Bot authentication required.' }, { status: 401 });
  const stopped = await updateAppStateIfChanged(state => {
    const before = JSON.stringify(state.gameSettings.default.gameHub);
    const channels = Object.keys(state.gameSettings.default.gameHub?.channels || {});
    const result = channels.flatMap(channel => stopInactiveChannelGames(state, channel).map(gameId => ({ channel, gameId })));
    return { changed: before !== JSON.stringify(state.gameSettings.default.gameHub), result };
  });
  return NextResponse.json({ stopped });
}
