/**
 * Chat Tag points are tracking-only, so a monthly crown pays a fixed amount of
 * SPMT XP instead of converting the winner's tag score.
 */
export const CROWN_XP_REWARDS: Record<number, number> = {
  1: 500,
  2: 250,
  3: 100,
};

export function crownXpReward(place: number): number {
  return CROWN_XP_REWARDS[place] || 0;
}

/**
 * One payout per winner per place per month, so re-running `set-winner` (or
 * correcting a placement and setting it back) never double-pays.
 */
export function crownUpstreamEventId(input: { userId: string; place: number; month: string }): string {
  const month = String(input.month || '').trim().toLowerCase().replace(/\s+/g, '-') || 'unknown-month';
  return `crown:${month}:${input.place}:${input.userId}`;
}
