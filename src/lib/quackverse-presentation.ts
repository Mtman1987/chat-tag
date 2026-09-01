export type QuackverseCharacterPresentation = 'masculine' | 'feminine' | 'androgynous';

type QuackversePresentationCard = {
  id: number;
  type?: string | null;
};

type QuackversePresentationCanon = {
  species?: string | null;
  presentation?: string | null;
  identityBaseId?: number | null;
  plumage?: string | null;
  className?: string | null;
};

const FEMALE_PLUMAGE_BY_SPECIES: Record<string, string> = {
  Mallard: 'adult hen Mallard plumage: warm mottled brown feathers, buff-and-brown face pattern, orange-brown bill with darker markings and a visible blue-violet speculum; no emerald drake head',
  'Northern Pintail': 'adult hen Northern Pintail plumage: finely mottled tan-brown body, pale face and throat, gray bill and a clean tapered tail without the exaggerated male pin feathers',
  'American Black Duck': 'adult female American Black Duck plumage: deep warm brown mottling with pale feather edges, darker crown and olive-to-dark bill; natural female proportions',
  'Blue-winged Teal': 'adult hen Blue-winged Teal plumage: mottled warm brown body, pale eye-line, dark bill and restrained powder-blue wing patch',
  'Common Eider': 'adult female Common Eider plumage: rich reddish-brown barred feathers, dark barring and the species-correct wedge-shaped bill; no black-and-white drake plumage',
  'Wood Duck': 'adult hen Wood Duck plumage: soft gray-brown body, white teardrop eye-ring and facial markings, subtle iridescent blue-green wing accents; no ornate drake crest colors',
  'Tundra Swan': 'adult female Tundra Swan plumage: clean white feathers, long elegant neck and black bill with the small yellow facial mark',
  'Trumpeter Swan': 'adult female Trumpeter Swan plumage: clean white feathers, powerful long neck and broad black bill',
  Gadwall: 'adult hen Gadwall plumage: mottled warm brown and buff feathers, orange-edged dark bill and subtle white wing patch; no gray vermiculated drake chest',
  'Mute Swan': 'adult female Mute Swan plumage: white feathers, long sculptural neck and orange bill with black facial base',
  'Harlequin Duck': 'adult hen Harlequin plumage: understated brown-gray feathers, pale cheek and ear spots and compact dark bill; no slate-blue drake pattern',
  'Ruddy Duck': 'adult hen Ruddy Duck plumage: gray-brown body, darker cap and cheek stripe with a broad dusky bill; no chestnut-and-blue-bill breeding-drake scheme',
  'Muscovy Duck': 'adult female Muscovy plumage: dark brown-black feathers with restrained white patches, smaller natural frame and subtle red facial caruncle detail',
  'Hooded Merganser': 'adult hen Hooded Merganser plumage: gray-brown body, warm cinnamon swept crest and narrow dark bill; no black-and-white drake fan crest',
  'Green-winged Teal': 'adult hen Green-winged Teal plumage: finely mottled brown body, subtle pale face pattern, compact dark bill and green wing speculum; no chestnut-and-emerald drake head',
  'Red-breasted Merganser': 'adult hen Red-breasted Merganser plumage: cool gray body, reddish-brown shaggy crested head and long narrow reddish bill',
  'Mandarin Duck': 'adult hen Mandarin plumage: elegant gray-brown feathers, white eye-ring and trailing eye stripe with subtle green-blue wing accents; no ornate orange drake sails',
  'Pekin Duck': 'adult female Pekin plumage: clean white feathers, sturdy rounded duck build and warm orange bill',
  'Common Loon': 'adult female Common Loon breeding plumage: black head, red eye, crisp black-and-white patterned neck and sharp dark bill; natural female build',
  Canvasback: 'adult hen Canvasback plumage: warm brown head and chest, gray-brown body and long sloping dark bill; no bright chestnut drake head',
  'Common Goldeneye': 'adult hen Common Goldeneye plumage: chocolate-brown head, pale gray body, bright golden eye and compact dark bill; no dark green-black drake head or white cheek spot',
  'Great Blue Heron': 'adult female Great Blue Heron plumage: blue-gray feathers, long neck and legs, swept-back crest and long spear-like yellow-gray bill',
  'Black Swan': 'adult female Black Swan plumage: black feathers with subtle pale wing edges, long neck and deep red bill',
  'Sandhill Crane': 'adult female Sandhill Crane plumage: tall ash-gray feathers, long neck and legs, dark pointed bill and restrained red crown patch',
};

const MALE_PLUMAGE_BY_SPECIES: Record<string, string> = {
  Mallard: 'adult drake Mallard plumage: unmistakable emerald-green head, narrow white neck ring, chestnut breast, pale gray body and warm yellow-orange bill',
  'Northern Pintail': 'adult drake Northern Pintail plumage: chocolate-brown head, crisp white neck stripe, pale breast, gray body and long dark central tail pins',
  'Blue-winged Teal': 'adult drake Blue-winged Teal plumage: blue-gray head with a bold white facial crescent, warm buff body with dark spotting and visible powder-blue wing patch',
  'Common Eider': 'adult drake Common Eider plumage: bold black-and-white body, pale green nape wash and wedge-shaped bill',
  'Wood Duck': 'adult drake Wood Duck plumage: ornate iridescent green-purple crested head, crisp white facial striping, chestnut breast and colorful flank detail',
  Gadwall: 'adult drake Gadwall plumage: fine gray vermiculation, black rump, chestnut wing patch and understated dark bill',
  'Harlequin Duck': 'adult drake Harlequin plumage: slate-blue body with crisp white facial and body markings edged in black, chestnut flank detail and compact bill',
  'Ruddy Duck': 'adult drake Ruddy Duck breeding plumage: rich chestnut body, dark cap, white cheek and broad bright blue-gray bill',
  'Hooded Merganser': 'adult drake Hooded Merganser plumage: dark body with a dramatic fan-shaped black-and-white crest, bright white chest and narrow dark bill',
  'Green-winged Teal': 'adult drake Green-winged Teal plumage: chestnut head with broad emerald eye sweep, finely patterned gray body and compact dark bill',
  'Red-breasted Merganser': 'adult drake Red-breasted Merganser plumage: shaggy dark-green crest, white neck collar, rusty mottled breast and long narrow reddish bill',
  'Mandarin Duck': 'adult drake Mandarin plumage: ornate orange sail feathers, cream and violet face pattern, iridescent green crest and layered chestnut plumage',
  Canvasback: 'adult drake Canvasback plumage: rich chestnut head, black chest, pale gray-white body and long sloping black bill',
  'Common Goldeneye': 'adult drake Common Goldeneye plumage: dark green-black head, bright golden eye, round white cheek spot, crisp black-and-white body and compact black bill',
};

function isDuckCard(card: QuackversePresentationCard) {
  return String(card?.type || '').trim().toLowerCase() === 'duck';
}

export function resolveQuackversePresentation(
  card: QuackversePresentationCard,
  canon?: QuackversePresentationCanon | null,
): QuackverseCharacterPresentation | '' {
  if (!isDuckCard(card)) return '';
  const canonical = String(canon?.presentation || '').trim().toLowerCase();
  if (canonical === 'masculine' || canonical === 'feminine' || canonical === 'androgynous') {
    return canonical;
  }

  // Unknown/base cards are deliberately balanced and deterministic. Use the
  // base identity so Prime/Elite/Ultra versions keep the same character sex.
  const identityBaseId = Number(canon?.identityBaseId || card.id || 0);
  return identityBaseId % 2 === 0 ? 'feminine' : 'masculine';
}

function sexNoun(speciesValue: unknown, presentation: QuackverseCharacterPresentation) {
  const species = String(speciesValue || 'waterfowl');
  if (presentation === 'androgynous') return `adult ${species} waterfowl person`;
  const lower = species.toLowerCase();
  const isSwan = lower.includes('swan');
  const isDuckLike = /duck|mallard|pintail|teal|eider|merganser|gadwall|goldeneye|canvasback|ruddy|muscovy|mandarin|pekin/.test(lower);
  if (presentation === 'masculine') {
    if (isSwan) return `adult male ${species} cob`;
    if (isDuckLike) return `adult male ${species} drake`;
    return `adult male ${species}`;
  }
  if (isSwan) return `adult female ${species} pen`;
  if (isDuckLike) return `adult female ${species} hen`;
  return `adult female ${species}`;
}

export function quackversePresentationPlumage(
  card: QuackversePresentationCard,
  canon: QuackversePresentationCanon,
) {
  const presentation = resolveQuackversePresentation(card, canon);
  const species = String(canon?.species || 'waterfowl');
  const generic = String(canon?.plumage || 'natural species-correct waterfowl plumage').trim();
  if (presentation === 'feminine') return FEMALE_PLUMAGE_BY_SPECIES[species] || `${generic}; render the natural adult female/hen version of this species rather than defaulting to male breeding plumage`;
  if (presentation === 'masculine') return MALE_PLUMAGE_BY_SPECIES[species] || `${generic}; render the natural adult male/drake version of this species where sexual dimorphism is visible`;
  return generic;
}

export function quackversePresentationDirection(
  card: QuackversePresentationCard,
  canon: QuackversePresentationCanon,
) {
  const presentation = resolveQuackversePresentation(card, canon);
  const species = String(canon?.species || 'waterfowl');
  const noun = sexNoun(species, presentation || 'androgynous');
  const plumage = quackversePresentationPlumage(card, canon);

  if (presentation === 'masculine') {
    return `SEX/PRESENTATION LOCK — ${noun}. This is an unmistakably masculine adult avian character, not a woman or feminine human-like character. Use a masculine species-correct face, class-appropriate masculine frame, posture and armor fit; do not add lipstick, eye makeup, glam eyelashes, cleavage, breasts, exaggerated hourglass curves or pin-up styling. Presentation-specific plumage overrides generic plumage wording if they conflict: ${plumage}. Keep the result fully avian with feathers, bill and species anatomy.`;
  }
  if (presentation === 'feminine') {
    return `SEX/PRESENTATION LOCK — ${noun}. This is an unmistakably feminine adult avian character, not a male/drake presentation. Use species-correct hen/female plumage, a feminine but class-appropriate face, posture and armor fit without turning the character into a human pin-up. Avoid exaggerated breasts, cleavage, hourglass anatomy, glam makeup or generic anime-girl styling. Presentation-specific plumage overrides generic plumage wording if they conflict: ${plumage}. Keep the result fully avian with feathers, bill and species anatomy.`;
  }
  return `PRESENTATION LOCK — intentionally androgynous ${noun}. Keep the face, silhouette and styling genuinely androgynous rather than strongly male or strongly female. Preserve species-correct avian anatomy and plumage: ${plumage}.`;
}

export function quackversePresentationNegativePrompt(
  card: QuackversePresentationCard,
  canon?: QuackversePresentationCanon | null,
) {
  const presentation = resolveQuackversePresentation(card, canon);
  if (presentation === 'masculine') {
    return 'female character, woman, feminine human face, lipstick, eye makeup, long glam eyelashes, breasts, cleavage, hourglass body, pin-up pose, anime girl, generic female duck';
  }
  if (presentation === 'feminine') {
    return 'male character, man, masculine human face, beard, mustache, hyper-masculine jaw, bodybuilder torso, oversized masculine shoulders, generic male drake plumage when species is dimorphic';
  }
  if (presentation === 'androgynous') {
    return 'strongly masculine presentation, strongly feminine presentation, pin-up styling, bodybuilder styling';
  }
  return '';
}
