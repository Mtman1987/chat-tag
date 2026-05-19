import { quackverseCards, type QuackverseCard } from '@/lib/quackverse-data';

export type QuackverseRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
type QuackversePackSlot = {
  label: string;
  cardType?: QuackverseCard['type'];
  rarities: QuackverseRarity[];
  weights: number[];
};

export const quackversePackSlots: QuackversePackSlot[] = [
  { label: 'Utility 1', cardType: 'Equipment', rarities: ['Common', 'Uncommon'], weights: [70, 30] },
  { label: 'Utility 2', cardType: 'Equipment', rarities: ['Common', 'Uncommon', 'Rare', 'Epic'], weights: [40, 35, 20, 5] },
  { label: 'Duck 1', cardType: 'Duck', rarities: ['Common', 'Uncommon'], weights: [70, 30] },
  { label: 'Duck 2', cardType: 'Duck', rarities: ['Uncommon', 'Rare'], weights: [75, 25] },
  { label: 'Wild', rarities: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'], weights: [35, 35, 20, 8, 2] },
];

export const rarityOrder: Record<string, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  Epic: 3,
  Legendary: 4,
};

function pickWeighted<T>(items: T[], weights: number[]) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * total;

  for (let index = 0; index < items.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return items[index];
  }

  return items[items.length - 1];
}

function getSlotCandidates(slot: QuackversePackSlot, rarity: QuackverseRarity) {
  const matchesType = (card: QuackverseCard) => !slot.cardType || card.type === slot.cardType;
  const matchesRarity = (card: QuackverseCard) => card.rarity === rarity;

  const strictPool = quackverseCards.filter((card) => matchesType(card) && matchesRarity(card));
  if (strictPool.length) return strictPool;

  const typePool = quackverseCards.filter(matchesType);
  if (typePool.length) return typePool;

  return quackverseCards;
}

function drawFromSlot(slot: QuackversePackSlot, seen: Set<number>) {
  const rarity = pickWeighted(slot.rarities, slot.weights);
  const candidates = getSlotCandidates(slot, rarity);
  const unusedPool = candidates.filter((card) => !seen.has(card.id));
  const source = unusedPool.length ? unusedPool : candidates;
  const card = source[Math.floor(Math.random() * source.length)];
  if (!card) {
    throw new Error(`No Quackverse cards available for slot ${slot.label}`);
  }
  seen.add(card.id);
  return card;
}

export function openQuackverseBoosterPack() {
  const seen = new Set<number>();

  return quackversePackSlots
    .map((slot) => drawFromSlot(slot, seen))
    .sort((a, b) => (rarityOrder[a.rarity || ''] ?? 0) - (rarityOrder[b.rarity || ''] ?? 0));
}

export function summarizeCollection(cardIds: number[]) {
  const counts = new Map<number, number>();
  cardIds.forEach((cardId) => counts.set(cardId, (counts.get(cardId) || 0) + 1));

  return [...counts.entries()]
    .map(([cardId, quantity]) => ({
      card: quackverseCards.find((card) => card.id === cardId) as QuackverseCard,
      quantity,
    }))
    .filter((entry) => entry.card)
    .sort((a, b) => a.card.id - b.card.id);
}
