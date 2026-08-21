import { NextRequest, NextResponse } from 'next/server';
import { getGameHubRuntimeActions } from '@/lib/game-hub-runtime';
import { getGameHubGame } from '@/lib/game-hub-registry';
import { normalizeGameHubChannel } from '@/lib/game-hub-state';
import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const channel = normalizeGameHubChannel(req.nextUrl.searchParams.get('channel'));
  if (!channel) return NextResponse.json({ error: 'channel is required.' }, { status: 400 });

  const after = String(req.nextUrl.searchParams.get('after') || '').trim();
  const gameIds = String(req.nextUrl.searchParams.get('games') || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => Boolean(getGameHubGame(value)));
  const state = await readAppState();
  const actions = getGameHubRuntimeActions(state, channel, { gameIds, after, limit: 100 });

  return NextResponse.json({
    channel,
    actions,
    latestId: actions.at(-1)?.id || after || null,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
