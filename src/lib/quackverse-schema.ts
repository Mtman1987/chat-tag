export type QuackverseEffectTag =
  | 'damage'
  | 'heal'
  | 'buff'
  | 'debuff'
  | 'move'
  | 'draw'
  | 'discard'
  | 'peek'
  | 'reveal'
  | 'cleanse'
  | 'stun'
  | 'root'
  | 'dodge'
  | 'shield'
  | 'specialGain'
  | 'specialSpend'
  | 'fatigue'
  | 'formation'
  | 'gear'
  | 'summon'
  | 'swap'
  | 'random'
  | 'attackFirst'
  | 'attackTwice';

export type QuackverseCardType = 'Duck' | 'Equipment';
export type QuackverseCostType = 'special' | 'none' | 'deck';
export type QuackverseTarget =
  | 'self'
  | 'ally'
  | 'enemy'
  | 'allAllies'
  | 'allEnemies'
  | 'board'
  | 'global';
export type QuackverseTiming =
  | 'passive'
  | 'onPlay'
  | 'active'
  | 'startTurn'
  | 'endTurn'
  | 'onFormation'
  | 'onEquip';
export type QuackverseRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
export type QuackverseStat = 'atk' | 'def' | 'spd' | 'spc' | 'hp';

export type QuackverseStructuredEffect = {
  name: string;
  text: string;
  tags: QuackverseEffectTag[];
  targets: QuackverseTarget;
  timing: QuackverseTiming;
  cost: number;
  amount?: number;
  stat?: QuackverseStat;
};

export type QuackverseLegacyCard = {
  id: number;
  name: string;
  type: QuackverseCardType;
  role: string | null;
  rarity: string | null;
  atk: number | null;
  def: number | null;
  spd: number | null;
  spc: number | null;
  hp: number | null;
  abilities: string[];
  effect: string | null;
  flavor: string;
  artUrl?: string;
  artHoverUrl?: string;
  artHoverDurationMs?: number;
};

export type QuackverseCardBase = QuackverseLegacyCard & {
  cost: number;
  costType: QuackverseCostType;
  targets: QuackverseTarget;
  timing: QuackverseTiming;
  effectTags: QuackverseEffectTag[];
  family: string;
  trunk: string;
  rarity: QuackverseRarity;
  text: string;
  structuredEffects: QuackverseStructuredEffect[];
};

export type QuackverseDuckCard = QuackverseCardBase & {
  type: 'Duck';
  atk: number;
  def: number;
  spd: number;
  spc: number;
  hp: number;
};

export type QuackverseEquipmentCard = QuackverseCardBase & {
  type: 'Equipment';
  atk: null;
  def: null;
  spd: null;
  spc: null;
  hp: null;
};

export type QuackverseCard = QuackverseDuckCard | QuackverseEquipmentCard;

export const quackverseEffectTags: QuackverseEffectTag[] = [
  'damage',
  'heal',
  'buff',
  'debuff',
  'move',
  'draw',
  'discard',
  'peek',
  'reveal',
  'cleanse',
  'stun',
  'root',
  'dodge',
  'shield',
  'specialGain',
  'specialSpend',
  'fatigue',
  'formation',
  'gear',
  'summon',
  'swap',
  'random',
  'attackFirst',
  'attackTwice',
];

const effectTagSet = new Set<string>(quackverseEffectTags);
const resolvedEffectTags = new Set<QuackverseEffectTag>(quackverseEffectTags);
const gearEffectTags = new Set<QuackverseEffectTag>([
  'damage',
  'heal',
  'buff',
  'debuff',
  'peek',
  'shield',
  'specialGain',
  'gear',
  'random',
  'attackFirst',
]);

export const quackverseGlossary = {
  ATK: 'outgoing damage power',
  DEF: 'damage mitigation',
  SPD: 'movement and turn tempo',
  SPC: 'special charge capacity and ability resource scaling',
  fatigue: 'penalty that lowers tempo and special gain',
  formation: 'board shape bonus triggered by specific occupied patterns',
  gear: 'attached modifier on a duck',
  heal: 'restores HP',
  damage: 'reduces HP',
  buff: 'positive stat or state gain',
  debuff: 'negative stat or state loss',
  zone: 'board region or positional grouping',
  'entry row': 'spawn / deploy row for each player',
} as const;

export const quackverseBalance = {
  abilityCostBands: {
    low: { min: 3, max: 5 },
    medium: { min: 6, max: 8 },
    strongUtility: { min: 9, max: 10 },
  },
  specialGainRate: 4,
  fatigueDecayRate: 1,
  maxGearSlots: 3,
  deckSize: 20,
  deckGearCap: 8,
  formationPowerBudget: {
    baselineHp: 1,
    baselineFatigue: 1,
    vpLimit: 3,
  },
} as const;

export const quackverseFormationRules = [
  { name: 'Battle Line', minimumSize: 3, awardsVp: true, appliesTo: 'fullSet' },
  { name: 'Flying V', minimumSize: 3, awardsVp: true, appliesTo: 'fullSet' },
  { name: 'Eclipse Cross', minimumSize: 5, awardsVp: true, appliesTo: 'fullSet' },
  { name: 'Cosmic Diamond', minimumSize: 4, awardsVp: true, appliesTo: 'fullSet' },
  { name: 'Medic Sanctuary', minimumSize: 3, awardsVp: true, appliesTo: 'chain' },
] as const;

function uniqueTags(tags: QuackverseEffectTag[]) {
  return [...new Set(tags)];
}

function textParts(card: QuackverseLegacyCard) {
  return card.type === 'Duck' ? card.abilities : [card.effect].filter(Boolean) as string[];
}

function inferFamily(card: QuackverseLegacyCard) {
  if (card.type === 'Equipment') return 'Gear';
  const haystack = `${card.name} ${card.role || ''}`.toLowerCase();
  if (haystack.includes('eclipse') || haystack.includes('void') || haystack.includes('shadow')) return 'Eclipse';
  if (haystack.includes('ranger')) return 'Ranger';
  if (haystack.includes('cosmic') || haystack.includes('galaxy') || haystack.includes('nebula') || haystack.includes('quasar')) return 'Cosmic';
  if (haystack.includes('lunar') || haystack.includes('moon')) return 'Lunar';
  if (haystack.includes('solar') || haystack.includes('starflare') || haystack.includes('ember') || haystack.includes('fire')) return 'Solar';
  if (haystack.includes('meteor')) return 'Meteor';
  if (haystack.includes('frost') || haystack.includes('ice')) return 'Frost';
  if (haystack.includes('thunder') || haystack.includes('bolt') || haystack.includes('storm')) return 'Storm';
  return 'Neutral';
}

function inferTrunk(card: QuackverseLegacyCard, family: string) {
  if (card.type === 'Equipment') return 'Gear';
  return (card.role || family).replace(/\s+/g, ' ').trim();
}

function inferTargets(text: string, cardType: QuackverseCardType): QuackverseTarget {
  if (/all allies|allied|to allies/i.test(text)) return 'allAllies';
  if (/all enemies|enemies/i.test(text)) return 'allEnemies';
  if (/enemy|opponent/i.test(text)) return 'enemy';
  if (/ally|allies/i.test(text)) return 'ally';
  if (/board|formation|zone/i.test(text)) return 'board';
  return cardType === 'Equipment' ? 'self' : 'self';
}

function inferTiming(text: string, cardType: QuackverseCardType): QuackverseTiming {
  if (cardType === 'Equipment') {
    if (/per turn/i.test(text)) return 'startTurn';
    return 'onEquip';
  }
  if (/always|aura|per turn/i.test(text)) return 'passive';
  return 'active';
}

function inferAbilityCost(text: string) {
  if (/(remove debuff|cleanse|remove debuffs)/i.test(text)) return 10;
  if (/(stun|loses next attack|dodge next attack|block next attack|peek|look at|reveal|move twice|attack twice|50%|chance|always goes first|root|draw|discard)/i.test(text)) {
    return 8;
  }
  if (/(heal|restore|repair|mend|blessing|sprinkle)/i.test(text)) return 6;
  if (/(swap SPD|reduce enemy|-\d+\s*(ATK|DEF|SPD|SPC)|\+\d+\s*(ATK|DEF|SPD|SPC)|\+?\d+\s*damage)/i.test(text)) return 4;
  return 5;
}

function inferAmount(text: string) {
  return Number(
    text.match(/(?:Heal|Restore|Repair|Mend|Blessing|Sprinkle)\D+(\d+)\s*HP/i)?.[1] ||
      text.match(/(?:Deal|Reduce damage taken by|Reduce all damage by)\D+(\d+)/i)?.[1] ||
      text.match(/[+-](\d+)\s*(?:ATK|DEF|SPD|SPC|damage)/i)?.[1] ||
      0,
  ) || undefined;
}

function inferStat(text: string): QuackverseStat | undefined {
  const match = text.match(/\b(ATK|DEF|SPD|SPC|HP)\b/i)?.[1]?.toLowerCase();
  return match === 'atk' || match === 'def' || match === 'spd' || match === 'spc' || match === 'hp' ? match : undefined;
}

function inferTags(text: string, cardType: QuackverseCardType): QuackverseEffectTag[] {
  const tags: QuackverseEffectTag[] = [];
  if (cardType === 'Equipment') tags.push('gear');
  if (/(damage|strike|slash|shot|burst|smash|rend|crash|impact|bolt|flare|hammer|dive|attack|slap|starfall|judgment)/i.test(text)) tags.push('damage');
  if (/(heal|restore|repair|mend|blessing|sprinkle|soothe)/i.test(text)) tags.push('heal');
  if (/(\+\d+\s*(ATK|DEF|SPD|SPC)|gain|aura|shield|armor|guard|cloak|wall|fortress|barrier|charge|resolve|wisdom|glow|prevent)/i.test(text)) tags.push('buff');
  if (/(-\d+\s*(ATK|DEF|SPD|SPC)|reduce enemy|loses next attack|blind|suppress|slow)/i.test(text)) tags.push('debuff');
  if (/(move twice|dash|drift|step)/i.test(text)) tags.push('move');
  if (/\bdraw\b/i.test(text)) tags.push('draw');
  if (/\bdiscard\b/i.test(text)) tags.push('discard');
  if (/(peek|look at|see opponent|see opponent.?s|star vision|lens)/i.test(text)) tags.push('peek');
  if (/\breveal\b/i.test(text)) tags.push('reveal');
  if (/(remove debuff|cleanse|remove debuffs|soothe)/i.test(text)) tags.push('cleanse');
  if (/\bstun\b/i.test(text)) tags.push('stun');
  if (/\broot\b/i.test(text)) tags.push('root');
  if (/(dodge|fade)/i.test(text)) tags.push('dodge');
  if (/(block next attack|reduce damage|shield|buckler|bracer|barrier|armor)/i.test(text)) tags.push('shield');
  if (/(\+\d+\s*SPC|gain \+\d+\s*SPC|surge|pulse|beam|beacon)/i.test(text)) tags.push('specialGain');
  if (/fatigue/i.test(text)) tags.push('fatigue');
  if (/formation/i.test(text)) tags.push('formation');
  if (/summon/i.test(text)) tags.push('summon');
  if (/swap\s+SPD/i.test(text)) tags.push('swap');
  if (/(random|50%|chance|reroll|stabilizer|prevents random)/i.test(text)) tags.push('random');
  if (/(always goes first|always attacks first|first attack)/i.test(text)) tags.push('attackFirst');
  if (/attack twice/i.test(text)) tags.push('attackTwice');
  return uniqueTags(tags);
}

function normalizeRarity(card: QuackverseLegacyCard): QuackverseRarity {
  if (card.rarity === 'Common' || card.rarity === 'Uncommon' || card.rarity === 'Rare' || card.rarity === 'Epic' || card.rarity === 'Legendary') {
    return card.rarity;
  }
  return card.type === 'Equipment' ? 'Common' : 'Common';
}

function toStructuredEffect(card: QuackverseLegacyCard, text: string): QuackverseStructuredEffect {
  const tags = inferTags(text, card.type);
  return {
    name: text.split(':')[0]?.trim() || card.name,
    text,
    tags,
    targets: inferTargets(text, card.type),
    timing: inferTiming(text, card.type),
    cost: card.type === 'Duck' ? inferAbilityCost(text) : 0,
    amount: inferAmount(text),
    stat: inferStat(text),
  };
}

export function normalizeQuackverseCard(card: QuackverseLegacyCard): QuackverseCard {
  const structuredEffects = textParts(card).map((text) => toStructuredEffect(card, text));
  const effectTags = uniqueTags(structuredEffects.flatMap((effect) => effect.tags));
  const family = inferFamily(card);
  const text = textParts(card).join(' ');
  const base = {
    ...card,
    cost: 0,
    costType: 'none' as QuackverseCostType,
    targets: structuredEffects[0]?.targets || 'self',
    timing: structuredEffects[0]?.timing || (card.type === 'Equipment' ? 'onEquip' : 'active'),
    effectTags,
    family,
    trunk: inferTrunk(card, family),
    rarity: normalizeRarity(card),
    text,
    structuredEffects,
  };

  if (card.type === 'Duck') {
    return {
      ...base,
      type: 'Duck',
      atk: Number(card.atk),
      def: Number(card.def),
      spd: Number(card.spd),
      spc: Number(card.spc),
      hp: Number(card.hp),
    };
  }

  return {
    ...base,
    type: 'Equipment',
    atk: null,
    def: null,
    spd: null,
    spc: null,
    hp: null,
  };
}

export function validateQuackverseCards(cards: QuackverseCard[]) {
  const errors: string[] = [];
  const ids = new Set<number>();

  for (const card of cards) {
    if (!Number.isInteger(card.id) || card.id < 1) errors.push(`${card.name || 'Unknown card'} has an invalid id.`);
    if (ids.has(card.id)) errors.push(`Duplicate card id ${card.id}.`);
    ids.add(card.id);
    if (!card.name) errors.push(`Card ${card.id} is missing name.`);
    if (!Number.isFinite(card.cost) || card.cost < 0) errors.push(`${card.name} has invalid cost.`);
    if (!['special', 'none', 'deck'].includes(card.costType)) errors.push(`${card.name} has invalid costType ${card.costType}.`);
    if (!card.family) errors.push(`${card.name} is missing family.`);
    if (!card.trunk) errors.push(`${card.name} is missing trunk.`);
    if (!card.text && card.type === 'Duck') errors.push(`${card.name} is missing display text.`);
    if (!card.structuredEffects.length) errors.push(`${card.name} has no structured effects.`);

    if (card.type === 'Duck') {
      for (const stat of ['atk', 'def', 'spd', 'spc', 'hp'] as const) {
        if (!Number.isFinite(card[stat])) errors.push(`${card.name} has invalid ${stat.toUpperCase()}.`);
      }
    }

    for (const tag of card.effectTags) {
      if (!effectTagSet.has(tag)) errors.push(`${card.name} declares unknown effect tag ${tag}.`);
      if (!resolvedEffectTags.has(tag)) errors.push(`${card.name} declares effect tag ${tag} without a resolver.`);
    }

    for (const effect of card.structuredEffects) {
      if (!effect.tags.length) errors.push(`${card.name} has unsupported effect text: "${effect.text}".`);
      if (card.type === 'Equipment') {
        for (const tag of effect.tags) {
          if (!gearEffectTags.has(tag)) errors.push(`${card.name} uses unsupported gear tag ${tag}.`);
        }
      }
    }
  }

  const formationNames = new Set<string>();
  for (const formation of quackverseFormationRules) {
    if (formationNames.has(formation.name)) errors.push(`Duplicate formation rule name ${formation.name}.`);
    formationNames.add(formation.name);
  }

  if (errors.length) {
    throw new Error(`Invalid Quackverse card data:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  }
}
