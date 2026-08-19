import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  GAME_HUB_CATALOG,
  getGameHubGame,
  normalizeGameHubGameIds,
} from '../src/lib/game-hub-registry';
import {
  GAME_HUB_COMMAND_SPECS,
  canonicalPlayerCommands,
  canonicalStreamerCommands,
} from '../src/lib/game-hub-commands';
import {
  cloneGameOverlayProfile,
  createGameOverlayProfile,
  patchGameOverlayProfile,
} from '../src/lib/game-hub-overlays';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Games Hub catalogs 20 peer games including Bingo and all 17 recovered games', () => {
  assert.equal(GAME_HUB_CATALOG.length, 20);
  assert.equal(new Set(GAME_HUB_CATALOG.map((game) => game.id)).size, 20);
  for (const expected of ['chat-tag', 'quackverse', 'bingo']) assert.ok(getGameHubGame(expected), `missing ${expected}`);
  const recovered = GAME_HUB_CATALOG.filter((game) => game.sourcePrototype?.startsWith('games/'));
  assert.equal(recovered.length, 17);
  for (const expected of [
    'chaosmode', 'chatgarden', 'chatwars', 'chickenroyale', 'colorsymphony',
    'colorwars', 'dancingparade', 'emojirain', 'emojitower', 'memorylane',
    'petrace', 'phraseguess', 'pixelbattle', 'rhythmpulse', 'treasurehunt',
    'wordchain', 'wordstorm',
  ]) assert.ok(getGameHubGame(expected), `missing ${expected}`);
});

test('every Games Hub chat command uses the spmt namespace', () => {
  assert.equal(GAME_HUB_COMMAND_SPECS.length, 20);
  for (const game of GAME_HUB_CATALOG) {
    const playerCommands = canonicalPlayerCommands(game);
    const streamerCommands = canonicalStreamerCommands(game);
    assert.ok(playerCommands.length >= 2, `${game.id} needs join/leave commands`);
    for (const command of [...playerCommands, ...streamerCommands]) {
      assert.match(command.trigger, /^spmt\s+/i, `${game.id} leaked a non-SPMT command`);
      assert.doesNotMatch(command.trigger, /^!/);
    }
  }
  const chatTag = canonicalPlayerCommands(getGameHubGame('chat-tag')!);
  assert.ok(chatTag.some((command) => command.trigger === 'spmt chattag'));
  assert.ok(chatTag.some((command) => command.trigger === 'spmt chattag tag @user'));
});

test('overlay game selection is deduped, valid, Bingo-aware and bounded', () => {
  const ids = normalizeGameHubGameIds([
    'bingo', 'chat-tag', 'chat-tag', 'nope', 'quackverse', 'emojirain', 'wordstorm',
    'petrace', 'chatwars', 'colorwars', 'treasurehunt', 'pixelbattle', 'chaosmode',
  ]);
  assert.equal(ids.length, 8);
  assert.deepEqual(ids.slice(0, 3), ['bingo', 'chat-tag', 'quackverse']);
  assert.ok(!ids.includes('nope'));
});

test('overlay profiles are neutral, cloneable and do not default to Chat Tag', () => {
  const blank = createGameOverlayProfile('12345', { ownerLogin: 'SpaceMountainLive' });
  assert.deepEqual(blank.gameIds, []);

  const created = createGameOverlayProfile('12345', {
    ownerLogin: 'SpaceMountainLive',
    name: 'Party Mix',
    gameIds: ['bingo', 'emojirain'],
    layout: 'auto-grid',
  });
  assert.equal(created.ownerLogin, 'spacemountainlive');
  assert.deepEqual(created.gameIds, ['bingo', 'emojirain']);

  const patched = patchGameOverlayProfile(created, { gameIds: ['wordstorm'], layout: 'focus' });
  assert.deepEqual(patched.gameIds, ['wordstorm']);
  assert.equal(patched.layout, 'focus');
  assert.equal(patched.id, created.id);

  const cloned = cloneGameOverlayProfile('12345', patched);
  assert.notEqual(cloned.id, patched.id);
  assert.equal(cloned.ownerLogin, 'spacemountainlive');
  assert.deepEqual(cloned.gameIds, ['wordstorm']);
});

test('bot image patches resolved chat, canonical Games Hub commands and Chat Tag compatibility rewrite', () => {
  const patcher = read('scripts/patch-game-hub-bot.mjs');
  const dockerfile = read('Dockerfile.bot');
  assert.match(patcher, /resolvedChannel/);
  assert.match(patcher, /api\/game-hub\/chat/);
  assert.match(patcher, /api\/game-hub\/command/);
  assert.match(patcher, /rewriteCommand/);
  assert.match(patcher, /let args = normalizedMsg/);
  assert.match(patcher, /fire-and-forget/i);
  assert.match(dockerfile, /patch-game-hub-bot\.mjs/);
  assert.match(dockerfile, /RUN node scripts\/patch-game-hub-bot\.mjs/);
});

test('game event transport is bounded and Games Points are a separate wallet', () => {
  const ingest = read('src/app/api/game-hub/chat/route.ts');
  const reader = read('src/app/api/overlay/game-hub/events/route.ts');
  const state = read('src/lib/game-hub-state.ts');
  const points = read('src/app/api/game-hub/points/route.ts');
  assert.match(ingest, /isBotRequest/);
  assert.match(ingest, /MAX_EVENTS_PER_CHANNEL = 250/);
  assert.match(ingest, /10 \* 60 \* 1000/);
  assert.match(reader, /MAX_READ_EVENTS = 100/);
  assert.match(reader, /Cache-Control.*no-store/);
  assert.match(state, /gamePointsBalance/);
  assert.match(state, /lifetimeEarned/);
  assert.match(state, /lifetimeSpent/);
  assert.match(points, /spendGameHubPoints/);
  assert.doesNotMatch(points, /spmt\/xp|communityPoints/i);
});

test('dynamic help and rules are derived only from ACTIVE channel scope', () => {
  const command = read('src/app/api/game-hub/command/route.ts');
  const help = read('src/app/games/help/page.tsx');
  const rules = read('src/app/games/rules/page.tsx');
  const scope = read('src/lib/game-hub-state.ts');
  assert.match(command, /spmt.*help/i);
  assert.match(command, /games\/rules\?channel=/);
  assert.match(command, /games\/help\?channel=/);
  assert.match(help, /resolveChannelGameIds/);
  assert.match(rules, /resolveChannelGameIds/);
  assert.match(scope, /stoppedGameIds/);
  assert.match(scope, /resolveChannelGameIds/);
});

test('activity bell removes Bingo notifications and replaces them with Games Hub scope/activity', () => {
  const feed = read('src/components/activity-feed.tsx');
  const activity = read('src/app/api/game-hub/activity/route.ts');
  assert.doesNotMatch(feed, /api\/bingo\/state/);
  assert.doesNotMatch(feed, /Recent Bingo/);
  assert.match(feed, /Active game scopes/);
  assert.match(feed, /Recent game players/);
  assert.match(feed, /Games Points/);
  assert.match(activity, /activeScopes/);
  assert.match(activity, /recentPlayers/);
});

test('Bingo uses shared game score and Games Points instead of Chat Tag scoring/notifications', () => {
  const bingo = read('src/app/api/bingo/state/route.ts');
  assert.match(bingo, /joinGameHubGame/);
  assert.match(bingo, /awardGameHubPoints/);
  assert.match(bingo, /gameId: 'bingo'/);
  assert.doesNotMatch(bingo, /postOrUpdateChatTagEmbed/);
  assert.doesNotMatch(bingo, /getScoringSettings/);
  assert.doesNotMatch(bingo, /player\.bingoPoints/);
});

test('all game detail pages and composite slots use peer templates', () => {
  const detail = read('src/app/games/[gameId]/page.tsx');
  const overlay = read('src/app/overlay/game-hub/[profileId]/page.tsx');
  const surface = read('src/components/game-hub-surface.tsx');
  const home = read('src/app/page.tsx');
  assert.match(detail, /Leaderboard/);
  assert.match(detail, /Players/);
  assert.match(detail, /Streamer commands/);
  assert.match(detail, /GameHubControlPanel/);
  assert.doesNotMatch(detail, /nativePath/);
  assert.match(overlay, /GameHubSurface/);
  assert.doesNotMatch(overlay, /game\.id === 'chat-tag'/);
  assert.doesNotMatch(overlay, /game\.id === 'quackverse'/);
  assert.match(surface, /data-game-hub-surface/);
  assert.match(home, /redirect\('\/games'\)/);
});

test('composite game overlays remain shell-free while the editor stays in the normal app shell', () => {
  const rootShell = read('src/components/root-shell.tsx');
  const overlay = read('src/app/overlay/game-hub/[profileId]/page.tsx');
  const studio = read('src/app/game-overlays/page.tsx');
  assert.match(rootShell, /pathname\.startsWith\('\/overlay\/game-hub\/'\)/);
  assert.doesNotMatch(rootShell, /pathname\.startsWith\('\/game-overlays/);
  assert.match(overlay, /GameHubSurface/);
  assert.match(studio, /app\/overlay\/games\/page/);
});
