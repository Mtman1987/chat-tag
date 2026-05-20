import type { QuackverseCard, QuackverseStat, QuackverseStructuredEffect } from '@/lib/quackverse-schema';

export type QuackverseGearSummary = {
  statModifiers: Partial<Record<QuackverseStat, number>>;
  damageReduction: number;
  healPerTurn: number;
};

export function findQuackverseStructuredEffect(card: QuackverseCard | null | undefined, text: string): QuackverseStructuredEffect | null {
  if (!card) return null;
  return (
    card.structuredEffects.find((effect) => effect.text === text) ||
    card.structuredEffects.find((effect) => effect.name === text.split(':')[0]?.trim()) ||
    null
  );
}

export function getQuackverseAbilityCost(card: QuackverseCard | null | undefined, ability: string) {
  return findQuackverseStructuredEffect(card, ability)?.cost ?? 5;
}

export function summarizeQuackverseGear(cards: QuackverseCard[]): QuackverseGearSummary {
  const summary: QuackverseGearSummary = {
    statModifiers: {},
    damageReduction: 0,
    healPerTurn: 0,
  };

  for (const card of cards) {
    for (const effect of card.structuredEffects) {
      for (const [stat, amount] of Object.entries(effect.statModifiers || {}) as Array<[QuackverseStat, number]>) {
        summary.statModifiers[stat] = Number(summary.statModifiers[stat] || 0) + Number(amount || 0);
      }
      summary.damageReduction += Number(effect.damageReduction || 0);
      summary.healPerTurn += Number(effect.healPerTurn || 0);
    }
  }

  return summary;
}
