import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { normalizeGameHubChannel, normalizeGameHubPlayerId, resolveChannelGameIds } from '@/lib/game-hub-state';
import { recordGameHubRuntimeAction } from '@/lib/game-hub-runtime';
import { readAppState, updateAppState } from '@/lib/volume-store';
import { paintMosaicCell, parseMosaicPaintCommand, unlockMosaicControls } from '@/lib/nebula-mosaic';
import { mosaicPricing } from '@/lib/mosaic-prices';

export const dynamic = 'force-dynamic';

function personalStatus(state: any, playerId: string, channel: string) {
  const store = state?.gameSettings?.default?.gameHub;
  const player = store?.players?.[playerId];
  const art = store?.channels?.[channel]?.mosaic?.current;
  const pricing = mosaicPricing();
  return {
    ...pricing, permanentlyUnlocked: Boolean(player?.mosaicControlsUnlockedAt),
    unlocked: pricing.testingFree || Boolean(player?.mosaicControlsUnlockedAt), balance: Number(player?.gamePointsBalance || 0),
    brush: (pricing.testingFree || art?.brushUnlockedByPlayer?.[playerId]) ? Number(art?.brushByPlayer?.[playerId] || 1) : 1,
    direction: art?.brushDirectionByPlayer?.[playerId] || 'right', brushUnlocked: pricing.testingFree || Boolean(art?.brushUnlockedByPlayer?.[playerId]),
  };
}

export async function GET(req: NextRequest) {
  const user = getSessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Sign in to see your controls and Nebula points.' }, { status: 401 });
  const channel = normalizeGameHubChannel(req.nextUrl.searchParams.get('channel'));
  return NextResponse.json(personalStatus(await readAppState(), normalizeGameHubPlayerId(user.id, user.twitchUsername), channel), { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest) {
  const user = getSessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Sign in to use click and touch controls.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const channel = normalizeGameHubChannel(body.channel);
  if (!channel) return NextResponse.json({ error: 'A channel is required.' }, { status: 400 });
  const identity = { userId: user.id, username: user.twitchUsername, displayName: user.twitchUsername };
  const playerId = normalizeGameHubPlayerId(identity.userId, identity.username);
  try {
    const result = await updateAppState(state => {
      if (body.action === 'unlock') {
        const purchase = unlockMosaicControls(state, identity);
        const status = personalStatus(state, playerId, channel);
        return { ...status, reply: status.testingFree ? 'Click and touch is free through October 11. No points needed.' : purchase.cost ? 'Click and touch controls unlocked permanently · 5,000 Nebula points spent.' : 'Your click and touch controls are already unlocked.' };
      }
      if (body.action !== 'paint') throw new Error('Unknown control.');
      if (!personalStatus(state, playerId, channel).unlocked) throw Object.assign(new Error('Unlock click and touch controls first.'), { status: 403 });
      if (!resolveChannelGameIds(state, channel).includes('pixelbattle')) throw new Error('Mosaic is not active in this channel.');
      const art = (state as any).gameSettings.default.gameHub.channels[channel]?.mosaic?.current;
      if (!art || art.status !== 'active' || art.id !== body.artworkId || art.activeBoard !== body.board) throw Object.assign(new Error('The board changed. Refresh and choose your square again.'), { status: 409 });
      const command = parseMosaicPaintCommand(`${String(body.coordinate || '')} ${String(body.color || '')}`);
      if (!command || command.coordinate !== body.coordinate || command.color !== body.color) throw new Error('Choose a valid square and color.');
      const painted = paintMosaicCell(state, { channel, ...identity, command });
      recordGameHubRuntimeAction(state, { channel, gameId: 'pixelbattle', actorId: user.id, username: user.twitchUsername, displayName: user.twitchUsername, action: 'paint', args: [command.coordinate, command.color], message: `${command.coordinate}${command.color}` });
      const reply = painted.outcome === 'painted' ? `Painted ${painted.paintedCount} square(s) · score ${painted.score}.`
        : painted.outcome === 'wrong' ? `${command.coordinate} needs ${painted.expected} · −1 score.` : 'Those squares are already painted.';
      return { ...personalStatus(state, playerId, channel), reply };
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Control unavailable.' }, { status: error?.status || 400 });
  }
}
