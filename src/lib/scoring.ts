export const DEFAULT_TAG_SUCCESS_POINTS = 100;
export const DEFAULT_TAG_PENALTY_POINTS = 50;
export const DEFAULT_BINGO_SQUARE_POINTS = 10;
export const DEFAULT_BINGO_WIN_POINTS = 250;

export type ScoringSettings = {
  tagSuccessPoints: number;
  tagPenaltyPoints: number;
  bingoSquarePoints: number;
  bingoWinPoints: number;
};

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function getScoringSettings(state: any): ScoringSettings {
  const settings = state?.gameSettings?.default || {};
  return {
    tagSuccessPoints: numberOrDefault(settings.tagSuccessPoints, DEFAULT_TAG_SUCCESS_POINTS),
    tagPenaltyPoints: numberOrDefault(settings.tagPenaltyPoints, DEFAULT_TAG_PENALTY_POINTS),
    bingoSquarePoints: numberOrDefault(settings.bingoSquarePoints, DEFAULT_BINGO_SQUARE_POINTS),
    bingoWinPoints: numberOrDefault(settings.bingoWinPoints, DEFAULT_BINGO_WIN_POINTS),
  };
}

export function scoreFromTagCounts(
  counts: { tags?: number; tagged?: number },
  scoring: ScoringSettings
): number {
  return (counts.tags || 0) * scoring.tagSuccessPoints - (counts.tagged || 0) * scoring.tagPenaltyPoints;
}
