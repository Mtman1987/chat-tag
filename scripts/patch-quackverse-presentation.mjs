import fs from 'node:fs';

const file = 'src/app/api/quackverse/art/generate/route.ts';
let source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const importNeedle = "import { getQuackverseVisualCanon } from '@/lib/quackverse-visual-canon';\n";
const importReplacement = `${importNeedle}import {\n  quackversePresentationDirection,\n  quackversePresentationNegativePrompt,\n  quackversePresentationPlumage,\n  resolveQuackversePresentation,\n} from '@/lib/quackverse-presentation';\n`;
if (!source.includes('quackversePresentationDirection')) {
  if (!source.includes(importNeedle)) throw new Error('Quackverse visual canon import not found.');
  source = source.replace(importNeedle, importReplacement);
}

const oldGender = `function genderPresentationForCard(card: any) {\n  if (String(card?.type || '').toLowerCase() !== 'duck') return '';\n  const ducks = quackverseCards.filter((item) => String(item.type || '').toLowerCase() === 'duck').sort((a, b) => a.id - b.id);\n  const index = ducks.findIndex((item) => item.id === card.id);\n  const presentation = index >= 0 && index % 2 === 0 ? 'feminine-presenting' : 'masculine-presenting';\n  return \`Character presentation: \${presentation} adult anthropomorphic waterfowl person. Keep the presentation readable through face, silhouette, posture and styling while preserving species-correct avian anatomy and the card's canonical class identity.\`;\n}\n`;
const newGender = `function genderPresentationForCard(card: any) {\n  if (String(card?.type || '').toLowerCase() !== 'duck') return '';\n  const canon = visualCanonForCard(card);\n  return quackversePresentationDirection(card, canon);\n}\n`;
if (source.includes(oldGender)) source = source.replace(oldGender, newGender);

source = source.replace(
  "    `Species identity: unmistakable species-correct bill, expressive avian eyes, visible feathers, two arms and two legs. Plumage: ${canon.plumage}.`,",
  "    `Species identity: unmistakable species-correct bill, expressive avian eyes, visible feathers, two arms and two legs. Sex-specific plumage lock: ${quackversePresentationPlumage(card, canon)}.`,",
);

const oldReferenceStart = `async function referenceImagesFor(card: any, origin: string, manifest: ReturnType<typeof normalizeQuackverseArtManifest>): Promise<string[]> {\n  const family = familyForCard(card);\n  const canon = card.type === 'Duck' ? visualCanonForCard(card) : null;\n  const candidates = quackverseCards.filter((candidate) => candidate.id !== card.id);\n  const ordered = [\n    ...(canon ? candidates.filter((candidate) => candidate.type === 'Duck' && visualCanonForCard(candidate).affinity === canon.affinity) : []),\n    ...candidates.filter((candidate) => family !== 'general' && familyForCard(candidate) === family),\n    ...candidates,\n  ];`;
const newReferenceStart = `async function referenceImagesFor(card: any, origin: string, manifest: ReturnType<typeof normalizeQuackverseArtManifest>): Promise<string[]> {\n  const family = familyForCard(card);\n  const canon = card.type === 'Duck' ? visualCanonForCard(card) : null;\n  const presentation = canon ? resolveQuackversePresentation(card, canon) : '';\n  const candidates = quackverseCards.filter((candidate) => candidate.id !== card.id);\n  const samePresentation = canon\n    ? candidates.filter((candidate) => {\n        if (candidate.type !== 'Duck') return false;\n        const candidateCanon = visualCanonForCard(candidate);\n        return resolveQuackversePresentation(candidate, candidateCanon) === presentation;\n      })\n    : [];\n  const ordered = [\n    ...(canon ? samePresentation.filter((candidate) => visualCanonForCard(candidate).affinity === canon.affinity) : []),\n    ...samePresentation.filter((candidate) => family !== 'general' && familyForCard(candidate) === family),\n    ...samePresentation,\n    ...candidates,\n  ];`;
if (source.includes(oldReferenceStart)) source = source.replace(oldReferenceStart, newReferenceStart);

const oldFunction = `async function callStreamWeaverImage(prompt: string, body: any, referenceImages: string[]) {`;
const newFunction = `async function callStreamWeaverImage(prompt: string, body: any, referenceImages: string[], card?: any) {`;
if (source.includes(oldFunction)) source = source.replace(oldFunction, newFunction);

const oldNegative = `          negativePrompt: QUACKVERSE_NEGATIVE_PROMPT,`;
const newNegative = `          negativePrompt: [QUACKVERSE_NEGATIVE_PROMPT, card ? quackversePresentationNegativePrompt(card, visualCanonForCard(card)) : ''].filter(Boolean).join(', '),`;
if (source.includes(oldNegative)) source = source.replace(oldNegative, newNegative);

source = source.replace(
  '      const generated = await callStreamWeaverImage(prompt, body, references);',
  '      const generated = await callStreamWeaverImage(prompt, body, references, card);',
);

if (!source.includes('quackversePresentationDirection(card, canon)')) throw new Error('Presentation direction was not wired.');
if (!source.includes('quackversePresentationPlumage(card, canon)')) throw new Error('Presentation plumage was not wired.');
if (!source.includes('quackversePresentationNegativePrompt(card, visualCanonForCard(card))')) throw new Error('Presentation negative prompt was not wired.');
if (!source.includes('resolveQuackversePresentation(candidate, candidateCanon) === presentation')) throw new Error('Presentation-aware references were not wired.');

fs.writeFileSync(file, source, 'utf8');
console.log('Quackverse presentation prompt patch applied.');
