import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Nebula Mosaic falls back when its preferred image provider is unavailable', () => {
  const source = fs.readFileSync('src/lib/nebula-mosaic-generation.ts', 'utf8');
  assert.match(source, /MOSAIC_IMAGE_PROVIDER \|\| 'openai'/);
  assert.match(source, /MOSAIC_IMAGE_FALLBACK_PROVIDERS \|\| 'pollinations'/);
  assert.match(source, /PRIMARY SUBJECT/);
  assert.match(source, /depict this exact subject clearly and literally/);
  assert.match(source, /Do not reinterpret, replace, or omit the named subject/);
  assert.match(source, /seed: Math\.floor\(Math\.random\(\) \* 2_147_483_646\) \+ 1/);
  assert.match(source, /unrelated subject, substituted subject/);
  assert.match(source, /quality: 'low'/);
  assert.match(source, /for \(const provider of providers\)/);
  assert.match(source, /trying the next provider/);
  assert.match(source, /failed across all providers/);
});
