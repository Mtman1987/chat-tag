import { claimNextMosaicRequest, failMosaicRequest, installMosaicTemplate, MOSAIC_GENERATION_MAX_ATTEMPTS, mosaicPublicSnapshot } from '@/lib/nebula-mosaic';
import { generateMosaicTemplate } from '@/lib/nebula-mosaic-generation';
import { awardSpmtXp } from '@/lib/spmt-client';
import { getGameHubStore, getGameHubGameStats, resolveChannelGameIds } from '@/lib/game-hub-state';
import { readAppState, updateAppState } from '@/lib/volume-store';
function publicPayload(state: any, channel: string) {
  return { channel, ...mosaicPublicSnapshot(state, channel), leaderboard: getGameHubGameStats(state, 'pixelbattle').leaderboard.slice(0,5).map((entry,index) => ({ rank:index+1, username:entry.displayName || entry.username, score:entry.score })) };
}
export function canAdvanceMosaic(state: any, channel: string) {
  if (!resolveChannelGameIds(state, channel).includes('pixelbattle')) return false;
  const current = state.gameSettings?.default?.gameHub?.channels?.[channel]?.mosaic?.current;
  if (!current) return true;
  if (!['completed', 'archived'].includes(current.status)) return false;
  const connection = state.discordWebhooks?.[`nebula-game:${channel}:pixelbattle`];
  // Give the finished painting a full card update before advancing. A failed
  // Discord connection must not prevent the community playing indefinitely.
  return !connection || connection.lastCompletedArtworkId === current.id
    || Date.now() - Date.parse(current.updatedAt) >= 120_000;
}
export async function processNextMosaicRequest(channel: string) {
  const request = await updateAppState((state) => canAdvanceMosaic(state, channel) ? claimNextMosaicRequest(state, channel) : null);
  if (!request) {
    const state = await readAppState();
    return { started: false, ...publicPayload(state, channel) };
  }

  try {
    const generated = await generateMosaicTemplate(request.theme);
    const payload = await updateAppState((state) => {
      if (!resolveChannelGameIds(state, channel).includes('pixelbattle')) throw new Error('Mosaic was stopped while generating.');
      installMosaicTemplate(state, channel, request.id, generated.target, generated);
      return publicPayload(state, channel);
    });
    return { started: true, theme: request.theme, ...payload };
  } catch (error: any) {
    const failed = await updateAppState((state) => failMosaicRequest(state, channel, request.id, error?.message || error));
    if (request.xpCost > 0 && Number(failed?.attempts || 0) >= MOSAIC_GENERATION_MAX_ATTEMPTS) {
      await awardSpmtXp({
        userId: request.playerId.replace(/^twitch:/, ''),
        eventType: 'nebula.mosaic.refund',
        idempotencyKey: `${request.id}:refund`,
        delta: request.xpCost,
        metadata: { channel, theme: request.theme, reason: 'generation-failed' },
      }).catch(() => null);
    }
    return {
      error: error?.message || 'Mosaic generation failed.',
      retrying: Number(failed?.attempts || 0) < MOSAIC_GENERATION_MAX_ATTEMPTS,
      refundedXp: Number(failed?.attempts || 0) >= MOSAIC_GENERATION_MAX_ATTEMPTS ? request.xpCost : 0,
    };
  }
}
export async function advanceQueuedMosaics() {
  const state = await readAppState();
  const channels = Object.keys(getGameHubStore(state).channels).filter(channel => {
    if (!canAdvanceMosaic(state, channel)) return false;
    // Use a disposable claim to select due work fairly; the real claim remains atomic.
    return !!claimNextMosaicRequest(structuredClone(state), channel);
  }).sort((a,b) => {
    const last = (channel: string) => Math.max(0, ...state.gameSettings.default.gameHub.channels[channel].mosaic.queue.map((item: any) => Date.parse(item.lastAttemptAt || '') || 0));
    return last(a) - last(b);
  }).slice(0, 2);
  await Promise.allSettled(channels.map(processNextMosaicRequest));
}
