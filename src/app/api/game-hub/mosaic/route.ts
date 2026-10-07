import { processNextMosaicRequest } from '@/lib/nebula-mosaic-runner';
import { NextRequest, NextResponse } from 'next/server';
import { getGameHubGameStats, normalizeGameHubChannel } from '@/lib/game-hub-state';
import {
  mosaicPublicSnapshot,
  observeMosaicActiveTime,
} from '@/lib/nebula-mosaic';
import { readAppState, updateAppStateIfChanged } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function publicPayload(state: any, channel: string) {
  const snapshot = mosaicPublicSnapshot(state, channel);
  const leaderboard = getGameHubGameStats(state, 'pixelbattle').leaderboard.slice(0, 5).map((entry, index) => ({
    rank: index + 1,
    username: entry.displayName || entry.username,
    score: entry.score,
  }));
  return { channel, ...snapshot, leaderboard };
}

export async function GET(req: NextRequest) {
  const channel = normalizeGameHubChannel(req.nextUrl.searchParams.get('channel'));
  if (!channel) return NextResponse.json({ error: 'channel is required.' }, { status: 400 });
  const snapshot = await readAppState();
  return NextResponse.json(publicPayload(snapshot, channel), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const channel = normalizeGameHubChannel(body.channel || req.nextUrl.searchParams.get('channel'));
  if (!channel) return NextResponse.json({ error: 'channel is required.' }, { status: 400 });

  if (body.action === 'heartbeat') {
    const payload = await updateAppStateIfChanged((state) => {
      const changed = observeMosaicActiveTime(state, channel);
      return { changed, result: publicPayload(state, channel) };
    });
    return NextResponse.json({ heartbeat: true, ...payload });
  }

  const result = await processNextMosaicRequest(channel);
  return NextResponse.json(result, { status: 'error' in result ? 502 : 200 });
}
