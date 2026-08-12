import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

test('public ChatTag dashboard keeps admin mode out of game components and uses the real live roster count', () => {
  const text = source('src/app/main-dashboard.tsx');
  assert.doesNotMatch(text, /value="admin"/);
  assert.doesNotMatch(text, /adminMode=\{isAdmin\}/);
  assert.doesNotMatch(text, /isClientAdminUsername/);
  assert.match(text, /<ChatTagGame players=\{memoizedPlayers\} \/>/);
  assert.match(text, /useLiveStreamers/);
  assert.match(text, /liveStreamers\.length/);
  assert.doesNotMatch(text, /filter\(\(player\) => player\.isActive\)\.length/);
});

test('header exposes the guarded Admin surface only from server-backed session authority', () => {
  const text = source('src/components/header.tsx');
  assert.doesNotMatch(text, /isClientAdminUsername/);
  assert.match(text, /user\?\.isAdmin/);
  assert.match(text, /href="\/settings\/game-controls"/);
  assert.match(text, /title="Admin"/);
  assert.match(text, /isAdminRoute/);
});

test('desktop ChatTag navigation exposes a visible owner Admin channel and fills the sidebar with the live community', () => {
  const sidebar = source('src/components/suite-sidebar.tsx');
  const shell = source('src/components/root-shell.tsx');
  assert.match(sidebar, /data-workspace-sidebar/);
  assert.match(sidebar, /PanelLeftClose/);
  assert.match(sidebar, /PanelLeftOpen/);
  assert.match(sidebar, /href: '\/'/);
  assert.match(sidebar, /href: '\/messages'/);
  assert.match(sidebar, /href: '\/overlay'/);
  assert.match(sidebar, /liveStreamers/);
  assert.match(sidebar, /Live community/);
  assert.match(sidebar, /user\?\.isAdmin/);
  assert.match(sidebar, /href="\/settings\/game-controls"/);
  assert.match(sidebar, />Admin</);
  assert.match(sidebar, /href="\/settings"/);
  assert.match(sidebar, /min-h-screen self-stretch/);
  assert.doesNotMatch(sidebar, /h-screen shrink-0/);
  assert.doesNotMatch(sidebar, /overflow-y-auto/);
  assert.match(shell, /<SuiteSidebar collapsed=\{sidebarCollapsed\} onToggle=\{toggleSidebar\} \/>/);
});

test('middleware recognizes the verified platform owner before guarded settings checks', () => {
  const middleware = source('src/middleware.ts');
  assert.match(middleware, /DEFAULT_OWNER_USERNAMES = \['mtman1987'\]/);
  assert.match(middleware, /CHAT_TAG_OWNER_USERNAMES/);
  assert.match(middleware, /verifiedNames\.some/);
  assert.match(middleware, /headers\.set\('x-spmt-is-admin', admin \? '1' : '0'\)/);
  assert.match(middleware, /isPublicLiveMembersRead/);
});

test('client admin helper cannot create authority outside middleware-guarded settings', () => {
  const helper = source('src/lib/client-admin.ts');
  assert.match(helper, /pathname === '\/settings'/);
  assert.match(helper, /pathname\.startsWith\('\/settings\/'\)/);
  assert.match(helper, /!username \|\| !isGuardedAdminSurface\(\)/);
});

test('game and Quackverse content administration remain under the guarded settings namespace', () => {
  const page = source('src/app/settings/game-controls/page.tsx');
  const middleware = source('src/middleware.ts');
  assert.match(page, /SPMT admin guarded/);
  assert.match(page, /<ChatTagGame adminMode \/>/);
  assert.match(page, /<QuackverseArtManager \/>/);
  assert.match(page, /public Cards tab remains read-only/);
  assert.match(middleware, /'\/settings'/);
  assert.match(middleware, /SPMT admin required/);
});

test('ChatTag shared Worktray remains visible and consumes one canonical Personal renderer', () => {
  const text = source('src/components/spmt-workspace-host.tsx');
  assert.match(text, /aria-label="SPMT workspace tray"/);
  assert.match(text, /Reconnect SPMT workspace/);
  assert.match(text, /const reconnectHref = '\/api\/auth\/spmt'/);
  assert.match(text, /data-canonical-personal-overlay="true"/);
  assert.match(text, /src=\{personalOverlayUrl\}/);
  assert.doesNotMatch(text, /widgets\.map\(/);
  assert.doesNotMatch(text, /left: `\$\{Number\(widget\.x/);
  assert.match(text, /window\.setInterval\(\(\) => void refresh\(\), 30_000\)/);
  assert.doesNotMatch(text, /if \(hiddenRoute \|\| embedded \|\| !connected\) return null/);
});
