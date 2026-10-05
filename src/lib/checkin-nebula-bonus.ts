import { createHash } from 'node:crypto';
import { awardGameHubPoints, getGameHubStore, getOrCreateGameHubPlayer } from '@/lib/game-hub-state';

export const CHECKIN_NEBULA_BONUS = 100;

// Called inside updateAppState: the wallet and receipt commit together.
export function awardCheckinNebulaBonus(state: any, input: {
  awardId: string; channel: string; userId: string; username: string; displayName?: string;
}) {
  if (!/^\d+$/.test(input.userId)) throw new Error('A verified Twitch user ID is required.');
  getGameHubStore(state);
  const receipts = (state.gameSettings.default.checkinNebulaAwards ||= {});
  const key = createHash('sha256').update(input.channel + ':' + input.awardId).digest('hex');
  const previous = receipts[key];
  if (previous) {
    if (previous.playerId !== `twitch:${input.userId}`) throw new Error('Check-in award already belongs to another rider.');
    return { ...previous, duplicate: true };
  }
  const player = getOrCreateGameHubPlayer(state, input);
  awardGameHubPoints(state, player, CHECKIN_NEBULA_BONUS, 'Space Mountain front-seat check-in', { channel: input.channel });
  const receipt = {
    awardId: input.awardId, playerId: player.id, username: player.username,
    amount: CHECKIN_NEBULA_BONUS, currency: 'nebula', balance: player.gamePointsBalance,
    at: new Date().toISOString(),
  };
  receipts[key] = receipt;
  return { ...receipt, duplicate: false };
}
