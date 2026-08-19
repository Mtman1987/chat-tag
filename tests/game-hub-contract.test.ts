import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  GAME_HUB_CATALOG,
  getGameHubGame,
  normalizeGameHubGameIds,
} from '../src/lib/game-hub-catalog';
import {
  cloneGameOverlayProfile,
  createGameOverlayProfile,
  patchGameOverlayProfile,
} from '../src/lib/game-hub-overlays';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Games Hub catalogs Tag, Quackverse and all 17 recovered chat games', () => {
  assert.equal(GAME_HUB_CATALOG.length, 19);
  assert.equal(new Set(GAME_HUB_CATALOG.map((game) => game.id)).size, 19);
  assert.equal(getGameHubGame('chat-tag')?.status, 'live');
  assert.equal(getGameHubGame('quackverse')?.status, 'live');
  const recovered = GAME_HUB_CATALOG.filter((game) => game.sourcePrototype?.startsWith('games/'));
  assert.equal(recovered.length, 17);
  for (const expected of [
    'chaosmode', 'chatgarden', 'chatwars', 'chickenroyale', 'colorsymphony',
    'colorwars', 'dancingparade', 'emojirain', 'emojitower', 'memorylane',
    'petrace', 'phraseguess', 'pixelbattle', 'rhythmpulse', 'treasurehunt',
    'wordchain', 'wordstorm',
  ]) assert.ok(getGameHubGame(expected), `missing ${expected}`);
});

test('overlay game selection is deduped, valid and bounded', () => {
  const ids = normalizeGameHubGameIds([
    'chat-tag', 'chat-tag', 'nope', 'quackverse', 'emojirain', 'wordstorm',
    'petrace', 'chatwars', 'colorwars', 'treasurehunt', 'pixelbattle', 'chaosmode',
  ]);
  assert.equal(ids.length, 8);
  assert.deepEqual(ids.slice(0, 3), ['chat-tag', 'quackverse', 'emojirain']);
  assert.ok(!ids.includes('nope'));
});

test('overlay profiles can be created, patched and cloned without sharing identity', () => {
  const created = createGameOverlayProfile('12345', {
    ownerLogin: 'SpaceMountainLive',
    name: 'Party Mix',
    gameIds: ['chat-tag', 'emojirain'],
    layout: 'auto-grid',
  });
  assert.equal(created.ownerLogin, 'spacemountainlive');
  assert.deepEqual(created.gameIds, ['chat-tag', 'emojirain']);

  const patched = patchGameOverlayProfile(created, { gameIds: ['wordstorm'], layout: 'focus' });
  assert.deepEqual(patched.gameIds, ['wordstorm']);
  assert.equal(patched.layout, 'focus');
  assert.equal(patched.id, created.id);

  const cloned = cloneGameOverlayProfile('12345', patched);
  assert.notEqual(cloned.id, patched.id);
  assert.equal(cloned.ownerLogin, 'spacemountainlive');
  assert.deepEqual(cloned.gameIds, ['wordstorm']);
});

test('bot image patches the existing resolved-channel chat handler into Games Hub', () => {
  const patcher = read('scripts/patch-game-hub-bot.mjs');
  const dockerfile = read('Dockerfile.bot');
  assert.match(patcher, /resolvedChannel/);
  assert.match(patcher, /api\/game-hub\/chat/);
  assert.match(patcher, /fire-and-forget/i);
  assert.match(dockerfile, /patch-game-hub-bot\.mjs/);
  assert.match(dockerfile, /RUN node scripts\/patch-game-hub-bot\.mjs/);
});

test('game event transport is bounded and public overlay reads remain separate from bot writes', () => {
  const ingest = read('src/app/api/game-hub/chat/route.ts');
  const reader = read('src/app/api/overlay/game-hub/events/route.ts');
  assert.match(ingest, /isBotRequest/);
  assert.match(ingest, /MAX_EVENTS_PER_CHANNEL = 250/);
  assert.match(ingest, /10 \* 60 \* 1000/);
  assert.match(reader, /MAX_READ_EVENTS = 100/);
  assert.match(reader, /Cache-Control.*no-store/);
});

test('composite game overlays remain shell-free while the editor stays in the normal app shell', () => {
  const rootShell = read('src/components/root-shell.tsx');
  const overlay = read('src/app/overlay/game-hub/[profileId]/page.tsx');
  const studio = read('src/app/game-overlays/page.tsx');
  assert.match(rootShell, /pathname\.startsWith\('\/overlay\/game-hub\/'\)/);
  assert.doesNotMatch(rootShell, /pathname\.startsWith\('\/game-overlays/);
  assert.match(overlay, /GameHubPrototypeSurface/);
  assert.match(overlay, /quackverse-overlay/);
  assert.match(overlay, /\/overlay\/\$\{encodeURIComponent\(tagOverlayUserId/);
  assert.match(studio, /app\/overlay\/games\/page/);
});
