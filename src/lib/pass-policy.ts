export const MAX_PASSES = 3;
export const PASS_SPEND_LIMIT = 3;
export const PASS_SPEND_WINDOW_MS = 24 * 60 * 60 * 1000;

type PassUseRecord = {
  taggerId?: string | null;
  timestamp?: number | string | null;
  passUsed?: boolean;
};

export function getPassSpendDenial(
  history: PassUseRecord[],
  userId: string,
  now = Date.now(),
): { reason: 'spend-limit'; hoursLeft: number; used: number } | null {
  const cutoff = now - PASS_SPEND_WINDOW_MS;
  const recentUses = (history || [])
    .filter((entry) => entry?.passUsed && entry.taggerId === userId)
    .map((entry) => {
      const rawTimestamp = entry.timestamp;
      return typeof rawTimestamp === 'number'
        ? rawTimestamp
        : rawTimestamp
          ? Date.parse(rawTimestamp)
          : 0;
    })
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > cutoff && timestamp <= now)
    .sort((a, b) => a - b);

  if (recentUses.length < PASS_SPEND_LIMIT) return null;

  const nextAvailableAt = recentUses[recentUses.length - PASS_SPEND_LIMIT] + PASS_SPEND_WINDOW_MS;
  return {
    reason: 'spend-limit',
    hoursLeft: Math.max(1, Math.ceil((nextAvailableAt - now) / (60 * 60 * 1000))),
    used: recentUses.length,
  };
}
