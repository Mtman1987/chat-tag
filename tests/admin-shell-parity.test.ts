import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

test('public ChatTag dashboard does not render admin navigation or enable game admin mode', () => {
  const text = source('src/app/main-dashboard.tsx');
  assert.doesNotMatch(text, /value="admin"/);
  assert.doesNotMatch(text, /adminMode=\{isAdmin\}/);
  assert.doesNotMatch(text, /isClientAdminUsername/);
  assert.match(text, /<ChatTagGame players=\{memoizedPlayers\} \/>/);
  assert.match(text, /Administrative controls stay behind the guarded settings area/);
});

test('public header does not use a browser username allowlist to expose admin controls', () => {
  const text = source('src/components/header.tsx');
  assert.doesNotMatch(text, /isClientAdminUsername/);
  assert.match(text, /isSettingsRoute/);
  assert.match(text, /\/settings\/game-controls/);
});

test('client admin presentation is disabled outside the middleware-guarded settings namespace', () => {
  const helper = source('src/lib/client-admin.ts');
  assert.match(helper, /pathname === '\/settings'/);
  assert.match(helper, /pathname\.startsWith\('\/settings\/'\)/);
  assert.match(helper, /!username \|\| !isGuardedAdminSurface\(\)/);
});

test('game and Quackverse content administration live under the guarded settings namespace', () => {
  const page = source('src/app/settings/game-controls/page.tsx');
  const middleware = source('src/middleware.ts');
  assert.match(page, /SPMT admin guarded/);
  assert.match(page, /<ChatTagGame adminMode \/>/);
  assert.match(page, /<QuackverseArtManager \/>/);
  assert.match(page, /public Cards tab remains read-only/);
  assert.match(middleware, /'\/settings'/);
  assert.match(middleware, /SPMT admin required/);
});

test('ChatTag shared Worktray remains visible even when SPMT needs reconnecting', () => {
  const text = source('src/components/spmt-workspace-host.tsx');
  assert.match(text, /aria-label="SPMT workspace tray"/);
  assert.match(text, /Reconnect SPMT workspace/);
  assert.match(text, /const reconnectHref = '\/api\/auth\/spmt'/);
  assert.match(text, /left: `\$\{Number\(widget\.x \|\| 0\)\}%`/);
  assert.match(text, /window\.setInterval\(\(\) => void refresh\(\), 30_000\)/);
  assert.doesNotMatch(text, /if \(hiddenRoute \|\| embedded \|\| !connected\) return null/);
});
