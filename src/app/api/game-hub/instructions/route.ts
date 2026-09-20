import { NextRequest, NextResponse } from 'next/server';
import { canonicalPlayerCommands } from '@/lib/game-hub-commands';
import { getGameHubInstructions } from '@/lib/game-hub-instructions';
import { getGameHubGame } from '@/lib/game-hub-registry';
import { normalizeGameHubChannel } from '@/lib/game-hub-state';
import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const channel = normalizeGameHubChannel(req.nextUrl.searchParams.get('channel'));
  if (!channel) return NextResponse.json({ error: 'Channel is required.' }, { status: 400 });
  const state = await readAppState();
  const instruction = getGameHubInstructions(state, channel);
  const game = instruction?.visible ? getGameHubGame(instruction.gameId) : null;

  return NextResponse.json({
    instruction: game ? {
      ...instruction,
      game: {
        id: game.id,
        name: game.name,
        howToPlay: game.howToPlay,
        commands: canonicalPlayerCommands(game),
        chatSignals: game.chatSignals || [],
      },
    } : { channel, visible: false, gameId: '', updatedAt: instruction?.updatedAt || '' },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
