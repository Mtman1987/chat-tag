export const MOSAIC_CONTROLS_COST = 5_000;
export const MOSAIC_BRUSH_COST = 100;
export const MOSAIC_REVEAL_COST = MOSAIC_BRUSH_COST;
export const MOSAIC_REVEAL_MS = 15_000;

// Owner-approved testing week, in America/Chicago. The end is exclusive.
export const MOSAIC_TESTING_START = '2026-10-05T00:00:00-05:00';
export const MOSAIC_TESTING_END = '2026-10-12T00:00:00-05:00';
export function mosaicPricing(now = Date.now()) {
  const testingFree = now >= Date.parse(MOSAIC_TESTING_START) && now < Date.parse(MOSAIC_TESTING_END);
  return {
    testingFree, testingEndsAt: MOSAIC_TESTING_END,
    controlsCost: testingFree ? 0 : MOSAIC_CONTROLS_COST,
    brushCost: testingFree ? 0 : MOSAIC_BRUSH_COST,
    revealCost: testingFree ? 0 : MOSAIC_REVEAL_COST,
  };
}
