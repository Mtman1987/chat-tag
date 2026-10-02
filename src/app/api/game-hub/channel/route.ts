import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { GAME_HUB_CATALOG } from '@/lib/game-hub-registry';
import { canonicalPlayerCommands, canonicalStreamerCommands, getCanonicalGameCommandSpec } from '@/lib/game-hub-commands';
import { normalizeGameHubChannel, resolveChannelGameIds, setChannelGameRunning } from '@/lib/game-hub-state';
import { getNebulaChatEvents } from '@/lib/game-hub-event-bus';
import { getGameHubRuntimeActions } from '@/lib/game-hub-runtime';
import { readAppState, updateAppState, updateAppStateIfChanged } from '@/lib/volume-store';
import { mosaicPublicSnapshot, resumeMosaicIfNeeded } from '@/lib/nebula-mosaic';

export const dynamic = 'force-dynamic';

const ACTIVITY_GAME_IDS = ['chatwars', 'pixelbattle', 'treasurehunt', 'bingo'] as const;
const ACTIVITY_IDLE_MS = 30 * 60_000;

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

  const now = Date.now();
  const state = await updateAppStateIfChanged((draft) => {
    const activeGameIds = resolveChannelGameIds(draft, channel);
    const recent = new Set<string>();

    for (const event of getNebulaChatEvents(channel, '', 250)) {
      const at = Date.parse(String((event as any)?.at || ''));
      if (!Number.isFinite(at) || now - at > ACTIVITY_IDLE_MS) continue;
      for (const gameId of Array.isArray((event as any)?.gameIds) ? (event as any).gameIds : []) {
        recent.add(String(gameId));
      }
    }
    for (const action of getGameHubRuntimeActions(draft, channel, { limit: 250 })) {
      const at = Date.parse(String(action?.at || ''));
      if (Number.isFinite(at) && now - at <= ACTIVITY_IDLE_MS) recent.add(String(action.gameId));
    }

    const mosaic = mosaicPublicSnapshot(draft, channel);
    let changed = false;
    for (const gameId of ACTIVITY_GAME_IDS) {
      if (!activeGameIds.includes(gameId)) continue;
      const mosaicStillActive = gameId === 'pixelbattle' && mosaic.artwork?.status === 'active';
      if (recent.has(gameId) || mosaicStillActive) continue;
      setChannelGameRunning(draft, channel, gameId, false);
      changed = true;
    }

    return {
      changed,
      result: {
        gameIds: resolveChannelGameIds(draft, channel),
        suspendedGameIds: mosaic.artwork?.status === 'suspended' ? ['pixelbattle'] : [],
      },
    };
  });

  const gameIds = (state as any).gameIds || [];
  const suspendedGameIds = (state as any).suspendedGameIds || [];
  return NextResponse.json({ channel, gameIds, games: publicGames(gameIds), suspendedGameIds });
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
      if (gameId === 'pixelbattle' && action === 'start') resumeMosaicIfNeeded(state, channel);
      const gameIds = resolveChannelGameIds(state, channel);
      return { gameIds, games: publicGames(gameIds) };
    });
    return NextResponse.json({ channel, action, gameId, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to update game state.' }, { status: 400 });
  }
}
