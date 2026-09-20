import { NextRequest, NextResponse } from 'next/server';
import { getGameHubGameStats, normalizeGameHubChannel } from '@/lib/game-hub-state';
import {
  claimNextMosaicRequest,
  failMosaicRequest,
  installMosaicTemplate,
  mosaicPublicSnapshot,
  observeMosaicActiveTime,
} from '@/lib/nebula-mosaic';
import { generateMosaicTemplate } from '@/lib/nebula-mosaic-generation';
import { awardSpmtXp } from '@/lib/spmt-client';
import { readAppState, updateAppState, updateAppStateIfChanged } from '@/lib/volume-store';

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

  const request = await updateAppState((state) => claimNextMosaicRequest(state, channel));
  if (!request) {
    const state = await readAppState();
    return NextResponse.json({ started: false, ...publicPayload(state, channel) });
  }

  try {
    const generated = await generateMosaicTemplate(request.theme);
    const payload = await updateAppState((state) => {
      installMosaicTemplate(state, channel, request.id, generated.target, generated);
      return publicPayload(state, channel);
    });
    return NextResponse.json({ started: true, theme: request.theme, ...payload });
  } catch (error: any) {
    await updateAppState((state) => failMosaicRequest(state, channel, request.id, error?.message || error));
    if (request.xpCost > 0) {
      await awardSpmtXp({
        userId: request.playerId.replace(/^twitch:/, ''),
        eventType: 'nebula.mosaic.refund',
        idempotencyKey: `${request.id}:refund`,
        delta: request.xpCost,
        metadata: { channel, theme: request.theme, reason: 'generation-failed' },
      }).catch(() => null);
    }
    return NextResponse.json({ error: error?.message || 'Mosaic generation failed.', refundedXp: request.xpCost }, { status: 502 });
  }
}
