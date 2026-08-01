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
 * Stable across locales, timezones and regions, unlike the human-readable month
 * stamped on the winner entry, so a redeploy can't change an existing key.
 */
export function crownMonthKey(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * One payout per winner per place per month, so re-running `set-winner` (or
 * correcting a placement and setting it back) never double-pays.
 */
export function crownUpstreamEventId(input: { userId: string; place: number; monthKey: string }): string {
  return `crown:${input.monthKey}:${input.place}:${input.userId}`;
}
