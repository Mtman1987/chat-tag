import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(path, 'utf8');

test('Quackverse image generation asks for one finished card image, not a concept sheet', async () => {
  const source = await read('src/app/api/quackverse/art/generate/route.ts');

  assert.match(source, /FINAL CARD ART ONLY/);
  assert.match(source, /not a concept sheet/);
  assert.match(source, /not a model sheet/);
  assert.match(source, /Exactly one primary subject/);
  assert.match(source, /no multiple angles/);
  assert.match(source, /no turnaround/);
  assert.match(source, /Card-crop safe/);
  assert.match(source, /central 70%/);
  assert.match(source, /16:10 landscape/);
  assert.match(source, /1024x640/);
});

test('Quackverse generation carries family and trunk visual identity into the prompt', async () => {
  const source = await read('src/app/api/quackverse/art/generate/route.ts');

  assert.match(source, /Common-thread lock/);
  assert.match(source, /Trunk likeness/);
  assert.match(source, /armorStyle/);
  assert.match(source, /plumage/);
  assert.match(source, /signature equipment/);
});

test('Quackverse art canon docs define invalid auto-generation output', async () => {
  const source = await read('docs/QUACKVERSE_ART_CANON.md');

  assert.match(source, /Invalid static art includes concept sheets/);
  assert.match(source, /character turnarounds/);
  assert.match(source, /multiple poses or angles/);
  assert.match(source, /should be regenerated/);
});


test('Quackverse prompts actually include canon family common-thread helpers', async () => {
  const source = await read('src/app/api/quackverse/art/generate/route.ts');

  assert.match(source, /canonCommonThreadDirection\(card, canon, family\)/);
  assert.match(source, /equipmentCommonThreadDirection\(card, family\)/);
  assert.match(source, /FINISHED_CARD_ART_RULES/);
});

test('Quackverse generation uses public reference URLs and a validated provider override', async () => {
  const source = await read('src/app/api/quackverse/art/generate/route.ts');

  assert.match(source, /getPublicAppOrigin/);
  assert.match(source, /canShareReferenceOrigin/);
  assert.match(source, /quackverseProviderOverride/);
  assert.match(source, /referenceImagesFor\(card, referenceOrigin, manifest\)/);
  assert.doesNotMatch(source, /referenceImagesFor\(card, req\.nextUrl\.origin, manifest\)/);
});

test('Quackverse admin manager can choose providers and delete generated art', async () => {
  const source = await read('src/components/quackverse-art-manager.tsx');

  assert.match(source, /IMAGE_PROVIDERS/);
  assert.match(source, /SelectValue/);
  assert.match(source, /providerOverride/);
  assert.match(source, /cloudflare/);
  assert.match(source, /eden/);
  assert.match(source, /seaart/);
  assert.match(source, /deleteAssets/);
  assert.match(source, /Purge Generated Static/);
});

test('Quackverse art API can delete selected assets and purge generated assets only', async () => {
  const source = await read('src/app/api/quackverse/art/route.ts');

  assert.match(source, /export async function DELETE/);
  assert.match(source, /generatedOnly/);
  assert.match(source, /isGeneratedAsset/);
  assert.match(source, /Bulk delete requires generatedOnly=true/);
  assert.match(source, /removeIfExists/);
});


test('Quackverse generation hardcodes the provider request to the card art window size', async () => {
  const source = await read('src/app/api/quackverse/art/generate/route.ts');

  assert.match(source, /QUACKVERSE_CARD_ART_RESOLUTION = '1024x640'/);
  assert.match(source, /resolution: QUACKVERSE_CARD_ART_RESOLUTION/);
  assert.match(source, /QUACKVERSE_NEGATIVE_PROMPT/);
  assert.match(source, /negativePrompt: QUACKVERSE_NEGATIVE_PROMPT/);
  assert.doesNotMatch(source, /resolution: body\.resolution \|\| '1024x1024'/);
});
