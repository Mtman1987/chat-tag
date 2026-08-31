export type QuackverseCanonRank = 'Base' | 'Prime' | 'Ultra' | 'Elite' | 'Legendary' | 'Relic';
export type QuackversePresentation = 'masculine' | 'feminine' | 'androgynous' | 'unspecified' | 'object';

export type QuackverseCanonGroup = {
  cardId: number;
  faction: string;
  lineage: string;
  artClass: string;
  subclass: string;
  affinity: string;
  rank: QuackverseCanonRank;
  identityBaseId?: number;
  presentation: QuackversePresentation;
};

/**
 * Layered visual identity for every Quackverse card.
 * Gameplay family/trunk stays unchanged; this table exists only for canon/art direction.
 */
export const QUACKVERSE_CANON_GROUPS: Record<number, QuackverseCanonGroup> = {
  1: { cardId: 1, faction: 'Ranger Corps', lineage: 'Starlash', artClass: 'Commander', subclass: 'Commander', affinity: 'Radiant', rank: 'Legendary', presentation: 'unspecified' },
  2: { cardId: 2, faction: 'Ranger Corps', lineage: 'Galaxy Ranger', artClass: 'Scout', subclass: 'Scout', affinity: 'Cosmic', rank: 'Base', presentation: 'unspecified' },
  3: { cardId: 3, faction: 'Ranger Corps', lineage: 'Web-Slap', artClass: 'Warrior', subclass: 'Melee Specialist', affinity: 'Radiant', rank: 'Base', presentation: 'unspecified' },
  4: { cardId: 4, faction: 'Ranger Corps', lineage: 'Featherbolt', artClass: 'Scout', subclass: 'Speed Striker', affinity: 'Storm', rank: 'Base', presentation: 'unspecified' },
  5: { cardId: 5, faction: 'Ranger Corps', lineage: 'Downburst', artClass: 'Tank', subclass: 'Heavy Ranger', affinity: 'Storm', rank: 'Base', presentation: 'unspecified' },
  6: { cardId: 6, faction: 'Ranger Corps', lineage: 'Cometfeather', artClass: 'Assassin', subclass: 'Stealth Operative', affinity: 'Cosmic', rank: 'Base', presentation: 'unspecified' },
  7: { cardId: 7, faction: 'Independent', lineage: 'McQuackers', artClass: 'Support', subclass: 'Lunar Support', affinity: 'Lunar', rank: 'Base', presentation: 'feminine' },
  8: { cardId: 8, faction: 'Independent', lineage: 'Downfeather', artClass: 'Medic', subclass: 'Nebula Medic', affinity: 'Tide', rank: 'Base', presentation: 'unspecified' },
  9: { cardId: 9, faction: 'House Von Quack', lineage: 'Von Quack', artClass: 'Warrior', subclass: 'Anti-Hero', affinity: 'Eclipse', rank: 'Base', presentation: 'unspecified' },
  10: { cardId: 10, faction: 'Independent', lineage: "O'Feathers", artClass: 'Engineer', subclass: 'Orbital Engineer', affinity: 'Cosmic', rank: 'Base', presentation: 'unspecified' },
  11: { cardId: 11, faction: 'Independent', lineage: 'Mallard', artClass: 'Navigator', subclass: 'Navigator', affinity: 'Cosmic', rank: 'Base', presentation: 'unspecified' },
  12: { cardId: 12, faction: 'House Von Quack', lineage: 'Von Quack', artClass: 'Diplomat', subclass: 'Diplomat', affinity: 'Radiant', rank: 'Base', presentation: 'feminine' },
  13: { cardId: 13, faction: 'Independent', lineage: 'Quacker', artClass: 'Scientist', subclass: 'Quantum Scientist', affinity: 'Cosmic', rank: 'Base', presentation: 'unspecified' },
  14: { cardId: 14, faction: 'Waddle Family', lineage: 'Waddle', artClass: 'Rookie', subclass: 'Rookie', affinity: 'Cosmic', rank: 'Base', presentation: 'unspecified' },
  15: { cardId: 15, faction: 'Forge Guild', lineage: 'Featherforge', artClass: 'Weaponsmith', subclass: 'Weaponsmith', affinity: 'Forge', rank: 'Base', presentation: 'unspecified' },
  16: { cardId: 16, faction: 'Quill Line', lineage: 'Quill', artClass: 'Scout', subclass: 'Aerial Ace', affinity: 'Cosmic', rank: 'Base', presentation: 'unspecified' },
  17: { cardId: 17, faction: 'Independent', lineage: 'Honkmaster', artClass: 'Warrior', subclass: 'Villain-Turned-Ally', affinity: 'Solar', rank: 'Base', presentation: 'unspecified' },
  18: { cardId: 18, faction: 'Ranger Corps / House Von Quack', lineage: 'Von Quack', artClass: 'Ranger', subclass: 'Shadow Ranger', affinity: 'Eclipse', rank: 'Base', presentation: 'unspecified' },
  19: { cardId: 19, faction: 'Independent', lineage: 'Shadowfeather', artClass: 'Assassin', subclass: 'Assassin', affinity: 'Eclipse', rank: 'Base', presentation: 'unspecified' },
  20: { cardId: 20, faction: 'Ranger Corps', lineage: 'Quackverse Ranger', artClass: 'Ranger', subclass: 'Mythic Ranger', affinity: 'Radiant', rank: 'Legendary', presentation: 'unspecified' },
  21: { cardId: 21, faction: 'Ranger Corps', lineage: 'Starflare', artClass: 'Ranger', subclass: 'Blaster Ranger', affinity: 'Solar', rank: 'Base', presentation: 'unspecified' },
  22: { cardId: 22, faction: 'Ranger Corps / Drake House', lineage: 'Drake', artClass: 'Scout', subclass: 'Speed Ranger', affinity: 'Cosmic', rank: 'Base', presentation: 'unspecified' },
  23: { cardId: 23, faction: 'Quill Line', lineage: 'Quill', artClass: 'Mystic', subclass: 'Mystic', affinity: 'Cosmic', rank: 'Base', presentation: 'unspecified' },
  24: { cardId: 24, faction: 'Ranger Corps', lineage: 'Ironplume', artClass: 'Tank', subclass: 'Tank Ranger', affinity: 'Forge', rank: 'Base', presentation: 'unspecified' },
  25: { cardId: 25, faction: 'Drake House', lineage: 'Void Drake', artClass: 'Warrior', subclass: 'Eclipse Warrior', affinity: 'Eclipse', rank: 'Base', presentation: 'unspecified' },
  26: { cardId: 26, faction: 'Ranger Corps', lineage: 'Starbreaker', artClass: 'Tank', subclass: 'Heavy Ranger', affinity: 'Cosmic', rank: 'Base', presentation: 'unspecified' },
  27: { cardId: 27, faction: 'Waddle Family', lineage: 'Waddle', artClass: 'Support', subclass: 'Lunar Support', affinity: 'Lunar', rank: 'Base', presentation: 'unspecified' },
  28: { cardId: 28, faction: 'Ranger Corps', lineage: 'Flashplume', artClass: 'Scout', subclass: 'Speed Ranger', affinity: 'Radiant', rank: 'Base', presentation: 'unspecified' },
  29: { cardId: 29, faction: 'Drake House', lineage: 'Eclipse Drake', artClass: 'Warrior', subclass: 'Shadow Warrior', affinity: 'Eclipse', rank: 'Base', presentation: 'unspecified' },
  30: { cardId: 30, faction: 'Ranger Corps / Forge Guild', lineage: 'Skyforge', artClass: 'Weaponsmith', subclass: 'Weaponsmith Ranger', affinity: 'Forge', rank: 'Base', presentation: 'unspecified' },
  31: { cardId: 31, faction: 'Drake House', lineage: 'Cosmic Drake', artClass: 'Warrior', subclass: 'Cosmic Warrior', affinity: 'Cosmic', rank: 'Base', presentation: 'unspecified' },
  32: { cardId: 32, faction: 'Ranger Corps / Quill Line', lineage: 'Quill', artClass: 'Ranger', subclass: 'Electric Ranger', affinity: 'Storm', rank: 'Base', presentation: 'unspecified' },
  33: { cardId: 33, faction: 'Drake House', lineage: 'Solar Drake', artClass: 'Warrior', subclass: 'Solar Warrior', affinity: 'Solar', rank: 'Base', presentation: 'unspecified' },
  34: { cardId: 34, faction: 'Ranger Corps', lineage: 'Frostplume', artClass: 'Ranger', subclass: 'Ice Ranger', affinity: 'Frost', rank: 'Base', presentation: 'unspecified' },
  35: { cardId: 35, faction: 'Mallard Line', lineage: 'Mallard', artClass: 'Warrior', subclass: 'Impact Striker', affinity: 'Meteor', rank: 'Base', presentation: 'unspecified' },
  36: { cardId: 36, faction: 'Ranger Corps', lineage: 'Starflare', artClass: 'Ranger', subclass: 'Fire Ranger', affinity: 'Solar', rank: 'Base', presentation: 'unspecified' },
  37: { cardId: 37, faction: 'Independent', lineage: 'Voidfeather', artClass: 'Assassin', subclass: 'Eclipse Assassin', affinity: 'Eclipse', rank: 'Base', presentation: 'unspecified' },
  38: { cardId: 38, faction: 'Ranger Corps', lineage: 'Cloudburst', artClass: 'Ranger', subclass: 'Weather Ranger', affinity: 'Tide', rank: 'Base', presentation: 'unspecified' },
  39: { cardId: 39, faction: 'Starseer Order', lineage: 'Starseer', artClass: 'Mystic', subclass: 'Mystic', affinity: 'Cosmic', rank: 'Base', presentation: 'androgynous' },
  40: { cardId: 40, faction: 'Ranger Corps', lineage: 'Ironwing', artClass: 'Tank', subclass: 'Tank Ranger', affinity: 'Forge', rank: 'Base', presentation: 'unspecified' },
  41: { cardId: 41, faction: 'Waddle Family', lineage: 'Cosmic Waddle', artClass: 'Support', subclass: 'Cosmic Support', affinity: 'Cosmic', rank: 'Base', presentation: 'unspecified' },
  42: { cardId: 42, faction: 'Ranger Corps', lineage: 'Emberquack', artClass: 'Ranger', subclass: 'Fire Ranger', affinity: 'Solar', rank: 'Base', presentation: 'unspecified' },
  43: { cardId: 43, faction: 'Whisper Line', lineage: 'Eclipse Whisper', artClass: 'Support', subclass: 'Shadow Support', affinity: 'Eclipse', rank: 'Base', presentation: 'androgynous' },
  44: { cardId: 44, faction: 'Ranger Corps', lineage: 'Galeplume', artClass: 'Ranger', subclass: 'Wind Ranger', affinity: 'Gale', rank: 'Base', presentation: 'unspecified' },
  45: { cardId: 45, faction: 'Forge Guild / Drake House', lineage: 'Drake', artClass: 'Weaponsmith', subclass: 'Weaponsmith', affinity: 'Forge', rank: 'Base', presentation: 'unspecified' },
  46: { cardId: 46, faction: 'Ranger Corps', lineage: 'Nightflare', artClass: 'Ranger', subclass: 'Eclipse Ranger', affinity: 'Eclipse', rank: 'Base', presentation: 'unspecified' },
  47: { cardId: 47, faction: 'Drake House', lineage: 'Lunar Drake', artClass: 'Warrior', subclass: 'Moon Warrior', affinity: 'Lunar', rank: 'Base', presentation: 'unspecified' },
  48: { cardId: 48, faction: 'Ranger Corps', lineage: 'Boltfeather', artClass: 'Ranger', subclass: 'Electric Ranger', affinity: 'Storm', rank: 'Base', presentation: 'unspecified' },
  49: { cardId: 49, faction: 'Drake House', lineage: 'Cosmic Drake', artClass: 'Warrior', subclass: 'Cosmic Elite', affinity: 'Cosmic', rank: 'Prime', identityBaseId: 31, presentation: 'unspecified' },
  50: { cardId: 50, faction: 'Ranger Corps', lineage: 'Frostwing', artClass: 'Ranger', subclass: 'Ice Ranger', affinity: 'Frost', rank: 'Base', presentation: 'unspecified' },
  51: { cardId: 51, faction: 'Drake House', lineage: 'Meteor Drake', artClass: 'Warrior', subclass: 'Impact Warrior', affinity: 'Meteor', rank: 'Base', presentation: 'unspecified' },
  52: { cardId: 52, faction: 'Ranger Corps', lineage: 'Starflare', artClass: 'Ranger', subclass: 'Fire Elite', affinity: 'Solar', rank: 'Prime', identityBaseId: 36, presentation: 'unspecified' },
  53: { cardId: 53, faction: 'Drake House', lineage: 'Void Drake', artClass: 'Warrior', subclass: 'Eclipse Elite', affinity: 'Eclipse', rank: 'Prime', identityBaseId: 25, presentation: 'unspecified' },
  54: { cardId: 54, faction: 'Ranger Corps', lineage: 'Stormfeather', artClass: 'Ranger', subclass: 'Weather Ranger', affinity: 'Storm', rank: 'Base', presentation: 'unspecified' },
  55: { cardId: 55, faction: 'Quill Line', lineage: 'Quill', artClass: 'Assassin', subclass: 'Shadow Assassin', affinity: 'Eclipse', rank: 'Base', presentation: 'unspecified' },
  56: { cardId: 56, faction: 'Ranger Corps / Forge Guild', lineage: 'Solarforge', artClass: 'Ranger', subclass: 'Solar Ranger', affinity: 'Solar', rank: 'Base', presentation: 'unspecified' },
  57: { cardId: 57, faction: 'Independent', lineage: 'Plume Sage', artClass: 'Mystic', subclass: 'Cosmic Support', affinity: 'Cosmic', rank: 'Base', presentation: 'unspecified' },
  58: { cardId: 58, faction: 'Ranger Corps', lineage: 'Emberstrike', artClass: 'Ranger', subclass: 'Fire Ranger', affinity: 'Solar', rank: 'Base', presentation: 'unspecified' },
  59: { cardId: 59, faction: 'Drake House', lineage: 'Voidflare Drake', artClass: 'Warrior', subclass: 'Eclipse Warrior', affinity: 'Eclipse', rank: 'Base', presentation: 'unspecified' },
  60: { cardId: 60, faction: 'Ranger Corps', lineage: 'Froststrike', artClass: 'Ranger', subclass: 'Ice Ranger', affinity: 'Frost', rank: 'Base', presentation: 'unspecified' },
  61: { cardId: 61, faction: 'Quill Line', lineage: 'Quill', artClass: 'Warrior', subclass: 'Impact Striker', affinity: 'Meteor', rank: 'Base', presentation: 'unspecified' },
  62: { cardId: 62, faction: 'Ranger Corps', lineage: 'Skyflare', artClass: 'Ranger', subclass: 'Fire Ranger', affinity: 'Solar', rank: 'Base', presentation: 'unspecified' },
  63: { cardId: 63, faction: 'Whisper Line', lineage: 'Eclipse Whisper', artClass: 'Support', subclass: 'Shadow Support', affinity: 'Eclipse', rank: 'Elite', identityBaseId: 43, presentation: 'androgynous' },
  64: { cardId: 64, faction: 'Ranger Corps', lineage: 'Galeplume', artClass: 'Ranger', subclass: 'Wind Ranger', affinity: 'Gale', rank: 'Elite', identityBaseId: 44, presentation: 'unspecified' },
  65: { cardId: 65, faction: 'Forge Guild / Mallard Line', lineage: 'Mallard', artClass: 'Weaponsmith', subclass: 'Weaponsmith', affinity: 'Forge', rank: 'Base', presentation: 'unspecified' },
  66: { cardId: 66, faction: 'Ranger Corps', lineage: 'Nightflare', artClass: 'Ranger', subclass: 'Eclipse Ranger Elite', affinity: 'Eclipse', rank: 'Prime', identityBaseId: 46, presentation: 'unspecified' },
  67: { cardId: 67, faction: 'Quill Line', lineage: 'Quill', artClass: 'Warrior', subclass: 'Moon Warrior', affinity: 'Lunar', rank: 'Base', presentation: 'unspecified' },
  68: { cardId: 68, faction: 'Ranger Corps', lineage: 'Boltfeather', artClass: 'Ranger', subclass: 'Electric Ranger', affinity: 'Storm', rank: 'Elite', identityBaseId: 48, presentation: 'unspecified' },
  69: { cardId: 69, faction: 'Drake House', lineage: 'Cosmic Drake', artClass: 'Warrior', subclass: 'Cosmic Elite', affinity: 'Cosmic', rank: 'Ultra', identityBaseId: 31, presentation: 'unspecified' },
  70: { cardId: 70, faction: 'Ranger Corps', lineage: 'Frostplume', artClass: 'Ranger', subclass: 'Ice Ranger', affinity: 'Frost', rank: 'Elite', identityBaseId: 34, presentation: 'unspecified' },
  71: { cardId: 71, faction: 'Drake House', lineage: 'Meteor Drake', artClass: 'Warrior', subclass: 'Impact Elite', affinity: 'Meteor', rank: 'Ultra', identityBaseId: 51, presentation: 'unspecified' },
  72: { cardId: 72, faction: 'Ranger Corps', lineage: 'Starflare', artClass: 'Ranger', subclass: 'Fire Elite', affinity: 'Solar', rank: 'Ultra', identityBaseId: 36, presentation: 'unspecified' },
  73: { cardId: 73, faction: 'Drake House', lineage: 'Void Drake', artClass: 'Warrior', subclass: 'Eclipse Elite', affinity: 'Eclipse', rank: 'Ultra', identityBaseId: 25, presentation: 'unspecified' },
  74: { cardId: 74, faction: 'Ranger Corps', lineage: 'Cloudburst', artClass: 'Ranger', subclass: 'Weather Ranger', affinity: 'Tide', rank: 'Elite', identityBaseId: 38, presentation: 'unspecified' },
  75: { cardId: 75, faction: 'Starseer Order', lineage: 'Starseer', artClass: 'Mystic', subclass: 'Mystic Elite', affinity: 'Cosmic', rank: 'Prime', identityBaseId: 39, presentation: 'androgynous' },
  76: { cardId: 76, faction: 'Ranger Corps', lineage: 'Ironplume', artClass: 'Tank', subclass: 'Tank Elite', affinity: 'Forge', rank: 'Prime', identityBaseId: 24, presentation: 'unspecified' },
  77: { cardId: 77, faction: 'Waddle Family', lineage: 'Cosmic Waddle', artClass: 'Support', subclass: 'Cosmic Support Elite', affinity: 'Cosmic', rank: 'Prime', identityBaseId: 41, presentation: 'unspecified' },
  78: { cardId: 78, faction: 'Ranger Corps', lineage: 'Emberquack', artClass: 'Ranger', subclass: 'Fire Ranger', affinity: 'Solar', rank: 'Elite', identityBaseId: 42, presentation: 'unspecified' },
  79: { cardId: 79, faction: 'Whisper Line', lineage: 'Eclipse Whisper', artClass: 'Support', subclass: 'Shadow Support Elite', affinity: 'Eclipse', rank: 'Prime', identityBaseId: 43, presentation: 'androgynous' },
  80: { cardId: 80, faction: 'Ranger Corps', lineage: 'Galeplume', artClass: 'Ranger', subclass: 'Wind Elite', affinity: 'Gale', rank: 'Prime', identityBaseId: 44, presentation: 'unspecified' },

  81: { cardId: 81, faction: 'Ranger Arsenal', lineage: 'Photon-Web', artClass: 'Equipment', subclass: 'Gauntlets', affinity: 'Radiant', rank: 'Relic', presentation: 'object' },
  82: { cardId: 82, faction: 'Support Arsenal', lineage: 'Nebula Medic', artClass: 'Equipment', subclass: 'Injector', affinity: 'Tide', rank: 'Relic', presentation: 'object' },
  83: { cardId: 83, faction: 'Eclipse Arsenal', lineage: 'Eclipse', artClass: 'Equipment', subclass: 'Cloak', affinity: 'Eclipse', rank: 'Relic', presentation: 'object' },
  84: { cardId: 84, faction: 'Forge Guild', lineage: 'Featherforge', artClass: 'Equipment', subclass: 'Armor', affinity: 'Forge', rank: 'Relic', presentation: 'object' },
  85: { cardId: 85, faction: 'Ranger Arsenal', lineage: 'Comet', artClass: 'Equipment', subclass: 'Boots', affinity: 'Cosmic', rank: 'Relic', presentation: 'object' },
  86: { cardId: 86, faction: 'Ranger Arsenal', lineage: 'Starshield', artClass: 'Equipment', subclass: 'Bracer', affinity: 'Radiant', rank: 'Relic', presentation: 'object' },
  87: { cardId: 87, faction: 'Eclipse Arsenal', lineage: 'Void', artClass: 'Equipment', subclass: 'Blade', affinity: 'Eclipse', rank: 'Relic', presentation: 'object' },
  88: { cardId: 88, faction: 'Support Arsenal', lineage: 'Lunar', artClass: 'Equipment', subclass: 'Charm', affinity: 'Lunar', rank: 'Relic', presentation: 'object' },
  89: { cardId: 89, faction: 'Elemental Arsenal', lineage: 'Solar', artClass: 'Equipment', subclass: 'Core Battery', affinity: 'Solar', rank: 'Relic', presentation: 'object' },
  90: { cardId: 90, faction: 'Heavy Arsenal', lineage: 'Gravity', artClass: 'Equipment', subclass: 'Anchor', affinity: 'Meteor', rank: 'Relic', presentation: 'object' },
  91: { cardId: 91, faction: 'Forge Guild', lineage: 'Starforge', artClass: 'Equipment', subclass: 'Hammer', affinity: 'Forge', rank: 'Relic', presentation: 'object' },
  92: { cardId: 92, faction: 'Scholar Arsenal', lineage: 'Nebula', artClass: 'Equipment', subclass: 'Lens', affinity: 'Cosmic', rank: 'Relic', presentation: 'object' },
  93: { cardId: 93, faction: 'Eclipse Arsenal', lineage: 'Eclipse', artClass: 'Equipment', subclass: 'Fang', affinity: 'Eclipse', rank: 'Relic', presentation: 'object' },
  94: { cardId: 94, faction: 'Support Arsenal', lineage: 'Cosmic', artClass: 'Equipment', subclass: 'Beacon', affinity: 'Cosmic', rank: 'Relic', presentation: 'object' },
  95: { cardId: 95, faction: 'Heavy Arsenal', lineage: 'Meteor', artClass: 'Equipment', subclass: 'Buckler', affinity: 'Meteor', rank: 'Relic', presentation: 'object' },
  96: { cardId: 96, faction: 'Elemental Arsenal', lineage: 'Frost', artClass: 'Equipment', subclass: 'Pendant', affinity: 'Frost', rank: 'Relic', presentation: 'object' },
  97: { cardId: 97, faction: 'Elemental Arsenal', lineage: 'Thunder', artClass: 'Equipment', subclass: 'Wraps', affinity: 'Storm', rank: 'Relic', presentation: 'object' },
  98: { cardId: 98, faction: 'Ranger Arsenal', lineage: 'Starflare', artClass: 'Equipment', subclass: 'Gauntlet', affinity: 'Solar', rank: 'Relic', presentation: 'object' },
  99: { cardId: 99, faction: 'Eclipse Arsenal', lineage: 'Void', artClass: 'Equipment', subclass: 'Amulet', affinity: 'Eclipse', rank: 'Relic', presentation: 'object' },
  100: { cardId: 100, faction: 'Scholar Arsenal', lineage: 'Cosmic', artClass: 'Equipment', subclass: 'Stabilizer', affinity: 'Cosmic', rank: 'Relic', presentation: 'object' },
  101: { cardId: 101, faction: 'Support Arsenal / Quill Line', lineage: 'Quill', artClass: 'Equipment', subclass: 'Healing Relic', affinity: 'Lunar', rank: 'Relic', presentation: 'object' },
};

export function getQuackverseCanonGroup(cardId: number): QuackverseCanonGroup | null {
  return QUACKVERSE_CANON_GROUPS[cardId] || null;
}
