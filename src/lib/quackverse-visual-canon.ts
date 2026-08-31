import { getQuackverseCanonGroup, type QuackversePresentation, type QuackverseCanonRank } from '@/lib/quackverse-canon-groups';

export type QuackverseVisualAffinity =
  | 'Radiant'
  | 'Cosmic'
  | 'Eclipse'
  | 'Solar'
  | 'Lunar'
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
  | 'Navigator'
  | 'Scout'
  | 'Rookie';

export type QuackverseVisualCanon = {
  cardId: number;
  name: string;
  family: string;
  faction: string;
  lineage: string;
  rank: QuackverseCanonRank;
  identityBaseId: number;
  presentation: QuackversePresentation;
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
 * Faction + lineage + class + subclass + affinity + rank + individual identity
 * can overlap without changing gameplay rules.
 */
export const QUACKVERSE_CANON_ART_STYLE =
  'Cinematic high-detail fantasy/science-fiction military waterfowl. Anthropomorphic upright anatomy, species-correct bill and plumage, realistic feather detail, premium armor materials, strong readable silhouette, dramatic environmental lighting, collectible-card composition, artwork only with no text, no frame, no logo and no watermark.';

const speciesById: Record<number, string> = {
  1: 'Mallard', 2: 'Northern Pintail', 3: 'American Black Duck', 4: 'Blue-winged Teal',
  5: 'Common Eider', 6: 'Wood Duck', 7: 'Tundra Swan', 8: 'Trumpeter Swan',
  9: 'American Black Duck', 10: 'Gadwall', 11: 'Mallard', 12: 'Mute Swan',
  13: 'Harlequin Duck', 14: 'Ruddy Duck', 15: 'Common Eider', 16: 'Northern Pintail',
  17: 'Muscovy Duck', 18: 'American Black Duck', 19: 'Hooded Merganser', 20: 'Mallard',
  21: 'Green-winged Teal', 22: 'Red-breasted Merganser', 23: 'Mandarin Duck', 24: 'Common Eider',
  25: 'Common Loon', 26: 'Muscovy Duck', 27: 'Pekin Duck', 28: 'Blue-winged Teal',
  29: 'Common Loon', 30: 'Gadwall', 31: 'Canvasback', 32: 'Harlequin Duck',
  33: 'Muscovy Duck', 34: 'Common Goldeneye', 35: 'Mallard', 36: 'American Black Duck',
  37: 'Hooded Merganser', 38: 'Great Blue Heron', 39: 'Black Swan', 40: 'Common Eider',
  41: 'Ruddy Duck', 42: 'Mallard', 43: 'Black Swan', 44: 'Sandhill Crane',
  45: 'Gadwall', 46: 'American Black Duck', 47: 'Trumpeter Swan', 48: 'Blue-winged Teal',
  49: 'Canvasback', 50: 'Mallard', 51: 'Muscovy Duck', 52: 'Common Eider',
  53: 'Common Loon', 54: 'Northern Pintail', 55: 'Hooded Merganser', 56: 'Common Eider',
  57: 'Tundra Swan', 58: 'Green-winged Teal', 59: 'American Black Duck', 60: 'Harlequin Duck',
  61: 'Canvasback', 62: 'Northern Pintail', 63: 'Black Swan', 64: 'Sandhill Crane',
  65: 'Mallard', 66: 'American Black Duck', 67: 'Mute Swan', 68: 'Blue-winged Teal',
  69: 'Canvasback', 70: 'Common Goldeneye', 71: 'Muscovy Duck', 72: 'American Black Duck',
  73: 'Common Loon', 74: 'Great Blue Heron', 75: 'Black Swan', 76: 'Common Eider',
  77: 'Ruddy Duck', 78: 'Mallard', 79: 'Black Swan', 80: 'Sandhill Crane',
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
  Lunar: ['pearl white', 'moon silver', 'pale lavender', 'cool blue'],
  Frost: ['steel blue', 'ice cyan', 'silver', 'snow white'],
  Storm: ['storm gray', 'steel', 'electric blue', 'white lightning'],
  Tide: ['deep teal', 'ocean blue', 'silver', 'sea-glass cyan'],
  Gale: ['weathered silver', 'slate', 'sage green', 'sky cyan'],
  Forge: ['gunmetal', 'bronze', 'leather brown', 'furnace orange'],
  Meteor: ['charcoal', 'iron', 'rust red', 'molten orange'],
};

const armorByAffinity: Record<QuackverseVisualAffinity, string> = {
  Radiant: 'clean celestial plate with feather-shaped white/silver panels and restrained gold trim',
  Cosmic: 'polished deep-space plate with starfield inlays, violet/cyan energy channels and streamlined knight geometry',
  Eclipse: 'elegant blackened plate with layered shadow cloth, indigo-violet dimensional seams and minimal reflective trim',
  Solar: 'heat-darkened black/bronze plate with ember vents, solar-gold edges and controlled glowing furnace seams',
  Lunar: 'pearl-silver armor with pale lavender moonstone inlays, crescent geometry and soft reflected moonlight',
  Frost: 'layered steel-blue plate, insulated mantle where appropriate, crystalline ice edges and frost-scored surfaces',
  Storm: 'storm-steel armor with conductive blue channels, aerodynamic plates and lightning-safe gauntlets',
  Tide: 'teal-and-silver naval armor with fluid engraved lines, sea-glass fittings and weatherproof layered cloth',
  Gale: 'lightweight wind-cut armor with long split cloak panels, feathered shoulder shapes and minimal drag',
  Forge: 'practical riveted gunmetal armor with reinforced leather, tool mounts, mechanical braces and workshop wear',
  Meteor: 'impact-scarred heavy iron armor with reinforced pauldrons, cratered surfaces and restrained molten fissures',
};

const vfxByAffinity: Record<QuackverseVisualAffinity, string> = {
  Radiant: 'clean photon trails, feather-shaped light and soft celestial bloom',
  Cosmic: 'nebula haze, tiny star particles and controlled cyan-violet cosmic arcs',
  Eclipse: 'thin dimensional rifts, shadow vapor and restrained violet-black energy',
  Solar: 'embers, heat distortion and compact orange-gold flame energy',
  Lunar: 'soft silver-blue lunar radiance, crescent reflections, pale lavender motes and a clearly visible moon when the scene allows',
  Frost: 'cold vapor, drifting snow grains and sharp blue ice crystals',
  Storm: 'white-blue lightning, rain spray and wind-driven charged particles',
  Tide: 'suspended water ribbons, mist, droplets and sea-glass cyan light',
  Gale: 'wind ribbons, airborne feathers and compressed-air distortion',
  Forge: 'sparks, steam, glowing tool cores and subtle mechanical exhaust',
  Meteor: 'impact sparks, ash, dust wake and short molten-orange shock trails',
};

const classSet = new Set<QuackverseVisualClass>([
  'Commander','Ranger','Warrior','Tank','Assassin','Mystic','Support','Medic','Engineer','Weaponsmith','Diplomat','Scientist','Navigator','Scout','Rookie',
]);
const affinitySet = new Set<QuackverseVisualAffinity>([
  'Radiant','Cosmic','Eclipse','Solar','Lunar','Frost','Storm','Tide','Gale','Forge','Meteor',
]);

function inferAffinity(card: CanonCardLike): QuackverseVisualAffinity {
  const group = getQuackverseCanonGroup(card.id);
  if (group && affinitySet.has(group.affinity as QuackverseVisualAffinity)) return group.affinity as QuackverseVisualAffinity;
  const text = `${card.name} ${card.role || ''} ${card.flavor || ''}`.toLowerCase();
  if (/eclipse|void|shadow|night/.test(text)) return 'Eclipse';
  if (/lunar|moon/.test(text)) return 'Lunar';
  if (/frost|ice/.test(text)) return 'Frost';
  if (/solar|fire|ember|starflare|skyflare/.test(text)) return 'Solar';
  if (/thunder|bolt|electric|lightning/.test(text)) return 'Storm';
  if (/cloud|rain|mist|downfeather/.test(text)) return 'Tide';
  if (/gale|wind/.test(text)) return 'Gale';
  if (/forge|engineer|iron|weapon/.test(text)) return 'Forge';
  if (/meteor|impact/.test(text)) return 'Meteor';
  if (/galaxy|cosmic|nebula|quasar|quantum|starseer|milky|orbit|comet|star/.test(text)) return 'Cosmic';
  return 'Radiant';
}

function inferClass(card: CanonCardLike): QuackverseVisualClass {
  const group = getQuackverseCanonGroup(card.id);
  if (group && classSet.has(group.artClass as QuackverseVisualClass)) return group.artClass as QuackverseVisualClass;
  const role = String(card.role || '').toLowerCase();
  if (/commander/.test(role)) return 'Commander';
  if (/assassin|stealth/.test(role)) return 'Assassin';
  if (/tank|heavy/.test(role)) return 'Tank';
  if (/medic/.test(role)) return 'Medic';
  if (/engineer/.test(role)) return 'Engineer';
  if (/weaponsmith/.test(role)) return 'Weaponsmith';
  if (/diplomat/.test(role)) return 'Diplomat';
  if (/scientist/.test(role)) return 'Scientist';
  if (/navigator/.test(role)) return 'Navigator';
  if (/mystic|sage/.test(role)) return 'Mystic';
  if (/support/.test(role)) return 'Support';
  if (/scout|ace|speed/.test(role)) return 'Scout';
  if (/rookie/.test(role)) return 'Rookie';
  if (/warrior|striker|anti-hero|villain|elite/.test(role)) return 'Warrior';
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
    case 'Navigator': return 'mobile explorer silhouette with star-map instruments, compass hardware and travel-ready field layers';
    case 'Rookie': return 'compact youthful silhouette with simpler armor and slightly oversized field gear';
    default: return 'athletic heroic ranger silhouette with balanced armor and clear mobility';
  }
}

function factionThread(faction: string, lineage: string) {
  const parts: string[] = [];
  if (/Ranger Corps/.test(faction)) parts.push('Ranger Corps thread: recurring feather-chevron chest geometry, compact ranger insignia, compatible belt hardware and shared military construction without cloning another Ranger');
  if (/Forge Guild/.test(faction)) parts.push('Forge Guild thread: hammer-and-anvil emblem, reinforced forearms, practical tool mounts and visible workshop wear');
  if (/Drake House/.test(faction)) parts.push('Drake House thread: keel-shaped breastplate seam, martial house crest and one asymmetrical heirloom pauldron');
  if (/Waddle Family/.test(faction)) parts.push('Waddle family thread: W-shaped clasp, rounded approachable geometry, recognizable sash/scarf treatment and a small inherited family emblem');
  if (/House Von Quack/.test(faction)) parts.push('House Von Quack thread: aristocratic crest, high collar, elegant curved metalwork and signet detailing');
  if (/Quill Line/.test(faction) || lineage === 'Quill') parts.push('Quill thread: quill-shaped crest or visor detail, fine etched glyphs and narrow pointed equipment silhouettes');
  if (/Whisper Line/.test(faction)) parts.push('Whisper thread: layered shadow cloth, crescent pin and a restrained black-silver support catalyst');
  if (/Starseer Order/.test(faction)) parts.push('Starseer thread: celestial map embroidery, orbital lens motif and refined astrolabe-like catalyst hardware');
  if (/Mallard Line/.test(faction)) parts.push('Mallard line thread: neck-ring heraldry and a recurring house badge adapted to the current specialty');
  return parts.join('. ');
}

function rankThread(rank: QuackverseCanonRank) {
  if (rank === 'Prime') return 'Prime evolution: preserve the exact underlying character identity while upgrading materials, detail density and authority.';
  if (rank === 'Ultra') return 'Ultra evolution: preserve the exact underlying character identity while presenting the most advanced form of the established equipment and power language.';
  if (rank === 'Elite') return 'Elite evolution: preserve identity while adding visibly improved specialist equipment and finish.';
  if (rank === 'Legendary') return 'Legendary rank: ceremonial refinement and unmistakable authority without abandoning the established identity.';
  return '';
}

function weaponForCard(card: CanonCardLike, className: QuackverseVisualClass, affinity: QuackverseVisualAffinity) {
  const role = String(getQuackverseCanonGroup(card.id)?.subclass || card.role || '').toLowerCase();
  if (/web-slap|melee/.test(role)) return 'photon-web gauntlets and a compact energy baton';
  if (/electric|storm|weather/.test(role)) return card.id % 2 ? 'conductive arc spear' : 'storm staff';
  if (/fire|solar/.test(role)) return card.id % 2 ? 'solar polearm' : 'ember rifle';
  if (/ice/.test(role)) return card.id % 2 ? 'frost spear' : 'crystal rifle';
  if (/moon|lunar/.test(role) || affinity === 'Lunar') return className === 'Support' || className === 'Mystic' ? 'crescent focus staff' : 'moon-silver spear';
  if (/wind/.test(role)) return 'light arc bow';
  if (className === 'Tank') return 'tower shield and heavy polearm';
  if (className === 'Assassin') return 'paired short blades';
  if (className === 'Mystic' || className === 'Medic' || className === 'Support' || className === 'Diplomat' || className === 'Scientist') return 'focus staff or controlled energy catalyst';
  if (className === 'Navigator') return 'star-map projector and compact sidearm';
  if (className === 'Engineer' || className === 'Weaponsmith') return 'powered forge hammer and utility tools';
  if (className === 'Scout') return card.id % 2 ? 'long arc rifle' : 'compact arc bow';
  if (className === 'Commander') return 'command spear and sidearm';
  if (className === 'Warrior') return card.id % 2 ? 'halberd' : 'long blade';
  return card.id % 3 === 0 ? 'arc rifle' : card.id % 3 === 1 ? 'ranger spear' : 'energy blade';
}

export function getQuackverseVisualCanon(card: CanonCardLike): QuackverseVisualCanon {
  const group = getQuackverseCanonGroup(card.id);
  const identityBaseId = group?.identityBaseId || card.id;
  const species = speciesById[identityBaseId] || speciesById[card.id] || 'Mallard';
  const affinity = inferAffinity(card);
  const className = inferClass(card);
  const family = String(card.family || 'Neutral');
  const faction = group?.faction || 'Independent';
  const lineage = group?.lineage || card.name;
  const subclass = group?.subclass || String(card.role || family || 'Quackverse adventurer');
  const rank = group?.rank || 'Base';
  const presentation = group?.presentation || 'unspecified';
  const plumage = plumageBySpecies[species] || 'natural waterfowl plumage with a distinctive, repeatable facial pattern';
  const build = buildForClass(className);
  const sharedThread = factionThread(faction, lineage);
  const armorStyle = [armorByAffinity[affinity], sharedThread].filter(Boolean).join('. ');
  const signatureWeapon = weaponForCard(card, className, affinity);
  const palette = paletteByAffinity[affinity];
  const vfx = vfxByAffinity[affinity];
  const presentationDirection = presentation === 'feminine'
    ? 'Presentation lock: feminine character presentation; do not masculinize the face, silhouette or styling.'
    : presentation === 'masculine'
      ? 'Presentation lock: masculine character presentation.'
      : presentation === 'androgynous'
        ? 'Presentation lock: intentionally androgynous character presentation.'
        : '';
  const lunarSceneDirection = affinity === 'Lunar'
    ? 'Lunar scene lock: moon imagery must be literal and readable; when outdoors or sky is visible, include a clearly visible moon rather than substituting generic night lighting.'
    : '';
  const canonSummary = [
    `${card.name} is canonically a ${species} ${className.toLowerCase()} with ${plumage}.`,
    `Faction/order: ${faction}. Lineage/house: ${lineage}. Rank: ${rank}. Subclass: ${subclass}.`,
    `Visual affinity: ${affinity}. Gameplay family remains ${family}; these are separate systems.`,
    `Individual identity base: card ${identityBaseId}; Prime/Ultra/Elite variants must retain the same face, bill, plumage, presentation and recognizable body identity as that base card.`,
    presentationDirection,
    lunarSceneDirection,
    `Body: ${build}. Armor: ${armorStyle}. Signature weapon: ${signatureWeapon}.`,
    `Palette hierarchy: ${palette.join(', ')}. Effects: ${vfx}.`,
    'Future art must preserve species, bill shape, plumage pattern, body identity, faction/lineage cues, class silhouette, signature equipment and palette hierarchy unless the canon file is deliberately changed.',
  ].filter(Boolean).join(' ');

  return {
    cardId: card.id,
    name: card.name,
    family,
    faction,
    lineage,
    rank,
    identityBaseId,
    presentation,
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
  const group = getQuackverseCanonGroup(cardId);
  const identityBaseId = group?.identityBaseId || cardId;
  return speciesById[identityBaseId] || speciesById[cardId] || 'Mallard';
}
