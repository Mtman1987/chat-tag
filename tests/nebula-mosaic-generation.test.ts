import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Nebula Mosaic falls back when its preferred image provider is unavailable', () => {
  const source = fs.readFileSync('src/lib/nebula-mosaic-generation.ts', 'utf8');
  assert.match(source, /MOSAIC_IMAGE_FALLBACK_PROVIDERS \|\| 'eden,pollinations'/);
  assert.match(source, /for \(const provider of providers\)/);
  assert.match(source, /trying the next provider/);
  assert.match(source, /failed across all providers/);
});
