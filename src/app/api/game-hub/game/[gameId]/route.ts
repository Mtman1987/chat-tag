import { NextRequest, NextResponse } from 'next/server';
import { canonicalJoinCommand, canonicalPlayerCommands, canonicalStreamerCommands } from '@/lib/game-hub-commands';
import { getGameHubGame } from '@/lib/game-hub-registry';
import { getGameHubGameStats, normalizeGameHubChannel, resolveChannelGameIds } from '@/lib/game-hub-state';
import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await context.params;
  const game = getGameHubGame(gameId);
  if (!game) return NextResponse.json({ error: 'Game not found.' }, { status: 404 });
  const channel = normalizeGameHubChannel(req.nextUrl.searchParams.get('channel'));
  const state = await readAppState();
  const stats = getGameHubGameStats(state, game.id);
  const activeGameIds = channel ? resolveChannelGameIds(state, channel) : [];

  return NextResponse.json({
    game: {
      id: game.id,
      name: game.name,
      description: game.description,
      rules: game.howToPlay,
      joinCommand: canonicalJoinCommand(game),
      playerCommands: canonicalPlayerCommands(game),
      streamerCommands: canonicalStreamerCommands(game),
    },
    channel: channel || null,
    active: channel ? activeGameIds.includes(game.id) : null,
    leaderboard: stats.leaderboard,
    players: stats.players,
  });
}
