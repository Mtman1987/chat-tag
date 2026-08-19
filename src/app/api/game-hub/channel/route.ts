import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { GAME_HUB_CATALOG } from '@/lib/game-hub-registry';
import { canonicalPlayerCommands, canonicalStreamerCommands, getCanonicalGameCommandSpec } from '@/lib/game-hub-commands';
import { normalizeGameHubChannel, resolveChannelGameIds, setChannelGameRunning } from '@/lib/game-hub-state';
import { readAppState, updateAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

function publicGames(gameIds: string[]) {
  const active = new Set(gameIds);
  return GAME_HUB_CATALOG
    .filter((game) => active.has(game.id))
    .map((game) => ({
      id: game.id,
      name: game.name,
      shortName: game.shortName,
      description: game.description,
      howToPlay: game.howToPlay,
      runtime: game.runtime,
      commandKey: getCanonicalGameCommandSpec(game)?.key || game.id,
      playerCommands: canonicalPlayerCommands(game),
      streamerCommands: canonicalStreamerCommands(game),
    }));
}

export async function GET(req: NextRequest) {
  const channel = normalizeGameHubChannel(req.nextUrl.searchParams.get('channel'));
  if (!channel) return NextResponse.json({ error: 'channel is required.' }, { status: 400 });
  const state = await readAppState();
  const gameIds = resolveChannelGameIds(state, channel);
  return NextResponse.json({ channel, gameIds, games: publicGames(gameIds) });
}

export async function POST(req: NextRequest) {
  const user = getSessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'SPMT authentication required.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const channel = normalizeGameHubChannel(body.channel || user.twitchUsername);
  const signedInChannel = normalizeGameHubChannel(user.twitchUsername);
  const isAdmin = req.headers.get('x-spmt-is-admin') === '1';
  if (!channel || (!isAdmin && channel !== signedInChannel)) {
    return NextResponse.json({ error: 'You can only control games for your own Twitch channel.' }, { status: 403 });
  }
  const action = String(body.action || '').trim().toLowerCase();
  const gameId = String(body.gameId || '').trim().toLowerCase();
  if (action !== 'start' && action !== 'stop') {
    return NextResponse.json({ error: 'action must be start or stop.' }, { status: 400 });
  }

  try {
    const result = await updateAppState((state) => {
      setChannelGameRunning(state, channel, gameId, action === 'start');
      const gameIds = resolveChannelGameIds(state, channel);
      return { gameIds, games: publicGames(gameIds) };
    });
    return NextResponse.json({ channel, action, gameId, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to update game state.' }, { status: 400 });
  }
}
