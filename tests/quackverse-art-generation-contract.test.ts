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
