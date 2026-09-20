export const NEBULA_MINUTE_MS = 60_000;

/**
 * The 24/7 channel gives each configured game an equal share of an hour.
 * One game stays put; two, three, and four-or-more games rotate on the
 * agreed 30/20/10 minute boundaries.
 */
export function nebulaRotationIntervalMs(gameCountValue: number): number | null {
  const gameCount = Math.max(0, Math.floor(Number(gameCountValue || 0)));
  if (gameCount <= 1) return null;
  if (gameCount === 2) return 30 * NEBULA_MINUTE_MS;
  if (gameCount === 3) return 20 * NEBULA_MINUTE_MS;
  return 10 * NEBULA_MINUTE_MS;
}

export function nebulaRotationIndexAt(nowValue: number, gameCountValue: number): number {
  const gameCount = Math.max(0, Math.floor(Number(gameCountValue || 0)));
  if (gameCount <= 1) return 0;
  const interval = nebulaRotationIntervalMs(gameCount)!;
  const now = Math.max(0, Math.floor(Number(nowValue || 0)));
  return Math.floor(now / interval) % gameCount;
}

export function nebulaNextRotationDelayMs(nowValue: number, gameCountValue: number): number | null {
  const interval = nebulaRotationIntervalMs(gameCountValue);
  if (!interval) return null;
  const now = Math.max(0, Math.floor(Number(nowValue || 0)));
  const elapsed = now % interval;
  return elapsed === 0 ? interval : interval - elapsed;
}
