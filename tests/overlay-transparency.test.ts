import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('workspace theming cannot paint a background over OBS overlay routes', () => {
  const shell = read('src/components/root-shell.tsx');
  const globals = read('src/app/globals.css');
  const parity = read('src/app/workspace-parity.css');

  assert.match(shell, /document\.body\.classList\.toggle\('overlay-route', isOverlayView\)/);
  assert.match(shell, /pathname\.startsWith\('\/overlay\/game-hub\/'\)/);
  assert.match(globals, /body\.overlay-route/);
  assert.match(parity, /:root\[data-workspace-theme\] body\.overlay-route/);
  assert.match(parity, /background:\s*transparent\s*!important/);
  assert.match(parity, /background-color:\s*transparent\s*!important/);
  assert.match(parity, /background-image:\s*none\s*!important/);
});
