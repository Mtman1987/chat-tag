import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('prototype gameplay HTML is public to the headless capture worker', () => {
  const middleware = read('src/middleware.ts');
  assert.match(middleware, /'\/nebula-arcade\/games\/'/);
});

test('prototype capture revisions include the global capture revision and source digest', () => {
  const manifest = read('src/app/api/game-hub/showcase-manifest/route.ts');
  assert.match(manifest, /revision: `html-\$\{NEBULA_GAMEPLAY_REVISION\}-\$\{digest\}`/);
  assert.match(manifest, /demo', '1'/);
  assert.match(manifest, /embedded', '1'/);
});
