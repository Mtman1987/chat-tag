export type QuackverseVisualAffinity =
  | 'Radiant'
  | 'Cosmic'
  | 'Eclipse'
  | 'Solar'
  | 'Frost'
  | 'Storm'
  | 'Tide'
  | 'Gale'
  | 'Forge'
  | 'Meteor';

export type QuackverseVisualClass =
  | 'Commander'
  | 'Ranger'
  | 'Warrior'
  | 'Tank'
  | 'Assassin'
  | 'Mystic'
  | 'Support'
  | 'Medic'
  | 'Engineer'
  | 'Weaponsmith'
  | 'Diplomat'
  | 'Scientist'
  | 'Scout'
  | 'Rookie';

export type QuackverseVisualCanon = {
  cardId: number;
  name: string;
  family: string;
  affinity: QuackverseVisualAffinity;
  className: QuackverseVisualClass;
  subclass: string;
  species: string;
  plumage: string;
  build: string;
  armorStyle: string;
  signatureWeapon: string;
  palette: string[];
  vfx: string;
  artStyle: string;
  canonSummary: string;
};

type CanonCardLike = {
  id: number;
  name: string;
  role?: string | null;
  family?: string | null;
  flavor?: string | null;
};

/**
 * Visual canon is intentionally separate from gameplay family/trunk.
 * A Ranger can be Solar, Frost, Tide, Storm, Eclipse, etc. without changing gameplay rules.
 */
export const QUACKVERSE_CANON_ART_STYLE =
  'Cinematic high-detail fantasy/science-fiction military waterfowl. Anthropomorphic upright anatomy, species-correct bill and plumage, realistic feather detail, premium armor materials, strong readable silhouette, dramatic environmental lighting, collectible-card composition, artwork only with no text, no frame, no logo and no watermark.';

const speciesById: Record<number, string> = {
  1: 'Mallard',
  2: 'Northern Pintail',
  3: 'American Black Duck',
  4: 'Blue-winged Teal',
  5: 'Common Eider',
  6: 'Wood Duck',
  7: 'Tundra Swan',
  8: 'Trumpeter Swan',
  9: 'American Black Duck',
  10: 'Gadwall',
  11: 'Mallard',
  12: 'Mute Swan',
  13: 'Harlequin Duck',
  14: 'Ruddy Duck',
  15: 'Common Eider',
  16: 'Northern Pintail',
  17: 'Muscovy Duck',
  18: 'American Black Duck',
  19: 'Hooded Merganser',
  20: 'Mallard',
  21: 'Green-winged Teal',
  22: 'Red-breasted Merganser',
  23: 'Mandarin Duck',
  24: 'Common Eider',
  25: 'Common Loon',
  26: 'Muscovy Duck',
  27: 'Pekin Duck',
  28: 'Blue-winged Teal',
  29: 'Common Loon',
  30: 'Gadwall',
  31: 'Canvasback',
  32: 'Harlequin Duck',
  33: 'Muscovy Duck',
  34: 'Common Goldeneye',
  35: 'Mallard',
  36: 'American Black Duck',
  37: 'Hooded Merganser',
  38: 'Great Blue Heron',
  39: 'Black Swan',
  40: 'Common Eider',
  41: 'Ruddy Duck',
  42: 'Mallard',
  43: 'Black Swan',
  44: 'Sandhill Crane',
  45: 'Gadwall',
  46: 'American Black Duck',
  47: 'Trumpeter Swan',
  48: 'Blue-winged Teal',
  49: 'Canvasback',
  50: 'Mallard',
  51: 'Muscovy Duck',
  52: 'Common Eider',
  53: 'Common Loon',
  54: 'Northern Pintail',
  55: 'Hooded Merganser',
  56: 'Common Eider',
  57: 'Tundra Swan',
  58: 'Green-winged Teal',
  59: 'American Black Duck',
  60: 'Harlequin Duck',
  61: 'Canvasback',
  62: 'Northern Pintail',
  63: 'Black Swan',
  64: 'Sandhill Crane',
  65: 'Gadwall',
  66: 'American Black Duck',
  67: 'Mute Swan',
  68: 'Blue-winged Teal',
  69: 'Canvasback',
  70: 'Hooded Merganser',
  71: 'Muscovy Duck',
  72: 'Common Eider',
  73: 'Common Loon',
  74: 'Great Blue Heron',
  75: 'Black Swan',
  76: 'Common Eider',
  77: 'Tundra Swan',
  78: 'Mallard',
  79: 'Black Swan',
  80: 'Sandhill Crane',
};

const plumageBySpecies: Record<string, string> = {
  Mallard: 'emerald-green head, narrow white neck ring, chestnut breast and warm orange bill',
  'Northern Pintail': 'chocolate-brown head, white neck stripe, pale breast and long elegant dark tail feathers',
  'American Black Duck': 'deep soot-brown to charcoal plumage, subtle warm feather edging and olive-to-dark bill',
  'Blue-winged Teal': 'mottled brown body, cool blue wing accents and compact athletic head shape',
  'Common Eider': 'large heavy waterfowl frame with bold black-and-white plumage and wedge-shaped bill',
  'Wood Duck': 'ornate iridescent green-purple head, white facial striping and chestnut breast',
  'Tundra Swan': 'clean white plumage, long elegant neck and black bill with a small yellow facial mark',
  'Trumpeter Swan': 'large white plumage, powerful long neck and broad black bill',
  Gadwall: 'fine gray-brown vermiculated plumage, black rump and understated dark bill',
  'Mute Swan': 'white plumage, long sculptural neck and orange bill with black facial base',
  'Harlequin Duck': 'slate-blue plumage with crisp white facial and body markings, compact bill',
  'Ruddy Duck': 'compact chestnut-and-dark plumage with broad blue-gray bill',
  'Muscovy Duck': 'large muscular dark plumage with restrained red facial caruncle detail',
  'Hooded Merganser': 'dark body, dramatic fan-shaped black-and-white crest and narrow bill',
  'Green-winged Teal': 'small agile build, chestnut head with emerald eye sweep and compact dark bill',
  'Red-breasted Merganser': 'lean body, shaggy dark-green crest, rusty breast and long narrow bill',
  'Mandarin Duck': 'ornate orange, cream, green and violet plumage with layered facial feathers',
  'Pekin Duck': 'clean white plumage, sturdy rounded build and warm orange bill',
  'Common Loon': 'black head, red eye, black-and-white patterned neck and sharp dark bill',
  Canvasback: 'long sloping dark bill, chestnut head, black chest and pale body',
  'Common Goldeneye': 'dark green-black head, bright golden eye, white cheek mark and compact black bill',
  'Great Blue Heron': 'blue-gray plumage, long neck, swept-back crest and long spear-like yellow-gray bill',
  'Black Swan': 'black plumage with subtle pale wing edges, long neck and deep red bill',
  'Sandhill Crane': 'tall ash-gray plumage, long neck and legs, dark pointed bill and restrained red crown patch',
};

const paletteByAffinity: Record<QuackverseVisualAffinity, string[]> = {
  Radiant: ['white', 'silver', 'pale gold', 'electric cyan'],
  Cosmic: ['midnight blue', 'violet', 'cyan', 'starlight silver'],
  Eclipse: ['black', 'charcoal', 'indigo', 'controlled violet'],
  Solar: ['obsidian', 'burnished bronze', 'ember orange', 'solar gold'],
  Frost: ['steel blue', 'ice cyan', 'silver', 'snow white'],
  Storm: ['storm gray', 'steel', 'electric blue', 'white lightning'],
  Tide: ['deep teal', 'ocean blue', 'silver', 'sea-glass cyan'],
  Gale: ['weathered silver', 'slate', 'sage green', 'sky cyan'],
  Forge: ['gunmetal', 'bronze', 'leather brown', 'furnace orange'],
  Meteor: ['charcoal', 'iron', 'rust red', 'molten orange'],
};

const armorByAffinity: Record<QuackverseVisualAffinity, string> = {
  Radiant: 'clean celestial ranger plate with feather-shaped white/silver panels and restrained gold trim',
  Cosmic: 'polished deep-space plate with starfield inlays, violet/cyan energy channels and streamlined knight geometry',
  Eclipse: 'elegant blackened plate with layered shadow cloth, indigo-violet dimensional seams and minimal reflective trim',
  Solar: 'heat-darkened black/bronze plate with ember vents, solar-gold edges and controlled glowing furnace seams',
  Frost: 'layered steel-blue plate, fur or insulated mantle where appropriate, crystalline ice edges and frost-scored surfaces',
  Storm: 'storm-steel armor with conductive blue channels, aerodynamic plates and lightning-safe gauntlets',
  Tide: 'teal-and-silver naval armor with fluid engraved lines, sea-glass fittings and weatherproof layered cloth',
  Gale: 'lightweight wind-cut ranger armor with long split cloak panels, feathered shoulder shapes and minimal drag',
  Forge: 'practical riveted gunmetal armor with reinforced leather, tool mounts, mechanical braces and workshop wear',
  Meteor: 'impact-scarred heavy iron armor with reinforced pauldrons, cratered surfaces and restrained molten fissures',
};

const vfxByAffinity: Record<QuackverseVisualAffinity, string> = {
  Radiant: 'clean photon trails, feather-shaped light and soft celestial bloom',
  Cosmic: 'nebula haze, tiny star particles and controlled cyan-violet cosmic arcs',
  Eclipse: 'thin dimensional rifts, shadow vapor and restrained violet-black energy',
  Solar: 'embers, heat distortion and compact orange-gold flame energy',
  Frost: 'cold vapor, drifting snow grains and sharp blue ice crystals',
  Storm: 'white-blue lightning, rain spray and wind-driven charged particles',
  Tide: 'suspended water ribbons, mist, droplets and sea-glass cyan light',
  Gale: 'wind ribbons, airborne feathers and compressed-air distortion',
  Forge: 'sparks, steam, glowing tool cores and subtle mechanical exhaust',
  Meteor: 'impact sparks, ash, dust wake and short molten-orange shock trails',
};

function inferAffinity(card: CanonCardLike): QuackverseVisualAffinity {
  const text = `${card.name} ${card.role || ''} ${card.flavor || ''}`.toLowerCase();
  if (/eclipse|void|shadow|night/.test(text)) return 'Eclipse';
  if (/frost|ice|lunar|moon/.test(text)) return 'Frost';
  if (/solar|fire|ember|starflare|skyflare/.test(text)) return 'Solar';
  if (/thunder|bolt|electric|lightning/.test(text)) return 'Storm';
  if (/cloud|rain|mist|downfeather/.test(text)) return 'Tide';
  if (/gale|wind/.test(text)) return 'Gale';
  if (/forge|engineer|iron|weapon/.test(text)) return 'Forge';
  if (/meteor|impact/.test(text)) return 'Meteor';
  if (/galaxy|cosmic|nebula|quasar|quantum|starseer|milky|orbit|comet|star/.test(text)) return 'Cosmic';
  if (/medic|support|diplomat/.test(text)) return 'Tide';
  return 'Radiant';
}

function inferClass(roleValue: string | null | undefined): QuackverseVisualClass {
  const role = String(roleValue || '').toLowerCase();
  if (/commander/.test(role)) return 'Commander';
  if (/assassin|stealth/.test(role)) return 'Assassin';
  if (/tank|heavy/.test(role)) return 'Tank';
  if (/medic/.test(role)) return 'Medic';
  if (/engineer/.test(role)) return 'Engineer';
  if (/weaponsmith/.test(role)) return 'Weaponsmith';
  if (/diplomat/.test(role)) return 'Diplomat';
  if (/scientist/.test(role)) return 'Scientist';
  if (/mystic|sage/.test(role)) return 'Mystic';
  if (/support/.test(role)) return 'Support';
  if (/scout|ace|speed/.test(role)) return 'Scout';
  if (/rookie/.test(role)) return 'Rookie';
  if (/warrior|striker|anti-hero|villain/.test(role)) return 'Warrior';
  return 'Ranger';
}

function buildForClass(className: QuackverseVisualClass) {
  switch (className) {
    case 'Tank': return 'broad, heavy, low-center-of-gravity heroic silhouette';
    case 'Assassin': return 'lean, angular, fast silhouette with narrow shoulders and long motion lines';
    case 'Scout': return 'lean athletic silhouette with long limbs and minimal armor bulk';
    case 'Commander': return 'tall authoritative silhouette with squared shoulders and ceremonial asymmetry';
    case 'Mystic': return 'upright elegant silhouette with flowing cloth and strong hand/staff readability';
    case 'Support':
    case 'Medic':
    case 'Diplomat': return 'graceful medium build with open, readable silhouette and lighter defensive armor';
    case 'Engineer':
    case 'Weaponsmith': return 'sturdy practical build with tool-bearing belt, reinforced forearms and workshop weight';
    case 'Warrior': return 'athletic combat build with balanced armor mass and strong forward stance';
    case 'Scientist': return 'slim practical build with arcane-tech instruments and protected utility layers';
    case 'Rookie': return 'compact youthful silhouette with simpler armor and slightly oversized field gear';
    default: return 'athletic heroic ranger silhouette with balanced armor and clear mobility';
  }
}

function weaponForCard(card: CanonCardLike, className: QuackverseVisualClass) {
  const role = String(card.role || '').toLowerCase();
  if (/electric|storm|weather/.test(role)) return card.id % 2 ? 'conductive arc spear' : 'storm staff';
  if (/fire|solar/.test(role)) return card.id % 2 ? 'solar polearm' : 'ember rifle';
  if (/ice|moon/.test(role)) return card.id % 2 ? 'frost spear' : 'crystal staff';
  if (/wind/.test(role)) return 'light arc bow';
  if (className === 'Tank') return 'tower shield and heavy polearm';
  if (className === 'Assassin') return 'paired short blades';
  if (className === 'Mystic' || className === 'Medic' || className === 'Support' || className === 'Diplomat' || className === 'Scientist') return 'focus staff or controlled energy catalyst';
  if (className === 'Engineer' || className === 'Weaponsmith') return 'powered forge hammer and utility tools';
  if (className === 'Scout') return card.id % 2 ? 'long arc rifle' : 'compact arc bow';
  if (className === 'Commander') return 'command spear and sidearm';
  if (className === 'Warrior') return card.id % 2 ? 'halberd' : 'long blade';
  return card.id % 3 === 0 ? 'arc rifle' : card.id % 3 === 1 ? 'ranger spear' : 'energy blade';
}

export function getQuackverseVisualCanon(card: CanonCardLike): QuackverseVisualCanon {
  const species = speciesById[card.id] || 'Mallard';
  const affinity = inferAffinity(card);
  const className = inferClass(card.role);
  const family = String(card.family || 'Neutral');
  const subclass = String(card.role || family || 'Quackverse adventurer');
  const plumage = plumageBySpecies[species] || 'natural waterfowl plumage with a distinctive, repeatable facial pattern';
  const build = buildForClass(className);
  const armorStyle = armorByAffinity[affinity];
  const signatureWeapon = weaponForCard(card, className);
  const palette = paletteByAffinity[affinity];
  const vfx = vfxByAffinity[affinity];
  const canonSummary = [
    `${card.name} is canonically a ${species} ${className.toLowerCase()} with ${plumage}.`,
    `Visual affinity: ${affinity}. Gameplay family remains ${family}; these are separate systems.`,
    `Body: ${build}. Armor: ${armorStyle}. Signature weapon: ${signatureWeapon}.`,
    `Palette hierarchy: ${palette.join(', ')}. Effects: ${vfx}.`,
    'Future art must preserve species, bill shape, plumage pattern, body silhouette, armor language, signature weapon and palette hierarchy unless the canon file is deliberately changed.',
  ].join(' ');

  return {
    cardId: card.id,
    name: card.name,
    family,
    affinity,
    className,
    subclass,
    species,
    plumage,
    build,
    armorStyle,
    signatureWeapon,
    palette,
    vfx,
    artStyle: QUACKVERSE_CANON_ART_STYLE,
    canonSummary,
  };
}

export function getQuackverseCanonSpecies(cardId: number) {
  return speciesById[cardId] || 'Mallard';
}
