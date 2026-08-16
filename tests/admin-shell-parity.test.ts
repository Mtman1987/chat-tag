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

test('middleware derives owner authority only from verified SPMT claims or immutable user IDs', () => {
  const middleware = source('src/middleware.ts');
  assert.doesNotMatch(middleware, /DEFAULT_OWNER_USERNAMES/);
  assert.doesNotMatch(middleware, /CHAT_TAG_OWNER_USERNAMES/);
  assert.doesNotMatch(middleware, /verifiedNames\.some/);
  assert.match(middleware, /CHAT_TAG_OWNER_USER_IDS/);
  assert.match(middleware, /identity\?\.is_admin/);
  assert.match(middleware, /identityId && trustedOwnerUserIds\(\)\.has\(identityId\)/);
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

test('Quackverse art generation and upload controls stay above card inspectors and remain clickable', () => {
  const manager = source('src/components/quackverse-art-manager.tsx');
  assert.match(manager, /data-quackverse-art-manager/);
  assert.match(manager, /relative z-\[60\] isolate/);
  assert.match(manager, /data-quackverse-art-actions/);
  assert.match(manager, /relative z-20/);
  assert.match(manager, /Generate Static Art/);
  assert.match(manager, /Generate Hover Still/);
  assert.match(manager, /pointer-events-auto/);
});

test('ChatTag Worktray no longer reconstructs overlay widgets', () => {
  const text = source('src/components/spmt-workspace-host.tsx');
  assert.match(text, /aria-label="SPMT workspace tray"/);
  assert.match(text, /Reconnect SPMT workspace/);
  assert.match(text, /const reconnectHref = '\/api\/auth\/spmt'/);
  assert.doesNotMatch(text, /widgets\.map\(/);
  assert.doesNotMatch(text, /widget\.x|widget\.y|widget\.opacity/);
  assert.match(text, /Personal overlay \{personalOverlayVisible \? 'On' : 'Off'\}/);
  assert.match(text, /window\.setInterval\(\(\) => void refresh\(\), 30_000\)/);
  assert.doesNotMatch(text, /if \(hiddenRoute \|\| embedded \|\| !connected\) return null/);
});
