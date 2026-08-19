import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Games Hub stages profiles in canonical SPMT Overlay Bay without scene writes', () => {
  const handoff = read('src/components/game-overlay-bay-handoff.tsx');
  const studio = read('src/app/overlay/games/page.tsx');

  assert.match(handoff, /https:\/\/spmt\.live\/embed\/overlays/);
  assert.match(handoff, /mode.*full/);
  assert.match(handoff, /app.*chat-tag/);
  assert.match(handoff, /sourceUrl/);
  assert.match(handoff, /sourceTitle/);
  assert.match(handoff, /sourceKey/);
  assert.match(handoff, /chat-tag:games-overlay:/);
  assert.doesNotMatch(handoff, /fetch\(/);
  assert.doesNotMatch(handoff, /overlay-workspace/);

  assert.match(studio, /GameOverlayBayHandoff/);
  assert.match(studio, /normal Web source/);
  assert.match(studio, /SPMT still owns scene position, size, layering, and the final Save/);
});
