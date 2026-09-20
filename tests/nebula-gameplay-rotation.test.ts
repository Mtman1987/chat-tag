import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GAME_HUB_CATALOG } from '../src/lib/game-hub-registry';
import { NEBULA_GAMEPLAY_ROTATION_MS, buildChatTagEmbed, nebulaGameplayImageUrl } from '../src/lib/chat-tag-discord';
import { nebulaNextRotationDelayMs, nebulaRotationIndexAt, nebulaRotationIntervalMs } from '../src/lib/nebula-rotation';

test('showcase catalog exposes all 20 games for gameplay capture', () => {
  assert.equal(GAME_HUB_CATALOG.length, 20);
  assert.equal(new Set(GAME_HUB_CATALOG.map((game) => game.id)).size, 20);
});

test('showcase manifest auto-discovers HTML games and fingerprints their source', () => {
  const route = readFileSync(new URL('../src/app/api/game-hub/showcase-manifest/route.ts', import.meta.url), 'utf8');
  assert.match(route, /public', 'nebula-arcade', 'games/);
  assert.match(route, /readdir\(PROTOTYPE_GAME_DIRECTORY/);
  assert.match(route, /createHash\('sha256'\)\.update\(html\)/);
  assert.match(route, /cacheStrategy: 'capture-once-per-source-revision'/);
  assert.match(route, /searchParams\.set\('demo', '1'\)/);
});

test('DSH gameplay image URL changes only at ten-minute boundaries', () => {
  const start = 2 * NEBULA_GAMEPLAY_ROTATION_MS;
  assert.equal(nebulaGameplayImageUrl(start), nebulaGameplayImageUrl(start + NEBULA_GAMEPLAY_ROTATION_MS - 1));
  assert.notEqual(nebulaGameplayImageUrl(start), nebulaGameplayImageUrl(start + NEBULA_GAMEPLAY_ROTATION_MS));
});

test('Discord embed keeps player avatar as thumbnail and gameplay as main image', () => {
  const payload = buildChatTagEmbed({
    tag: { currentIt: { twitchUsername: 'Player', avatarUrl: 'https://example.com/player.png' }, playerCount: 1 },
    leaderboard: [], recentAnnouncements: [], recentHistory: [],
  }, 'https://chat-tag-new.fly.dev');
  const embed = payload.embeds[0];
  assert.equal(embed.thumbnail?.url, 'https://example.com/player.png');
  assert.match(embed.image?.url || '', /discord-stream-hub-new\.fly\.dev\/api\/nebula-arcade\/gameplay\/current\.gif\?slot=/);
});

test('bot refreshes the persistent embed on the ten-minute gameplay boundary', () => {
  const source = readFileSync(new URL('../bot.js', import.meta.url), 'utf8');
  assert.match(source, /scheduleNebulaGameplayEmbedRotation\(\)/);
  assert.match(source, /Nebula Arcade gameplay rotation/);
});

test('live game slots obey the agreed one/two/three/four-game timing', () => {
  assert.equal(nebulaRotationIntervalMs(0), null);
  assert.equal(nebulaRotationIntervalMs(1), null);
  assert.equal(nebulaRotationIntervalMs(2), 30 * 60_000);
  assert.equal(nebulaRotationIntervalMs(3), 20 * 60_000);
  assert.equal(nebulaRotationIntervalMs(4), 10 * 60_000);
  assert.equal(nebulaRotationIntervalMs(12), 10 * 60_000);
});

test('rotation is wall-clock stable so an overlay reload recovers the same game', () => {
  const start = 30 * 60_000;
  assert.equal(nebulaRotationIndexAt(start, 2), 1);
  assert.equal(nebulaRotationIndexAt(start + 29 * 60_000, 2), 1);
  assert.equal(nebulaRotationIndexAt(start + 30 * 60_000, 2), 0);
  assert.equal(nebulaNextRotationDelayMs(start + 12_345, 2), 30 * 60_000 - 12_345);
});

test('SpaceMountain event stage rotates only Word Chain and Phrase Guess', () => {
  const route = readFileSync(new URL('../src/app/api/overlay/game-hub/[profileId]/route.ts', import.meta.url), 'utf8');
  assert.match(route, /gameIds: \['wordchain', 'phraseguess'\]/);
  assert.match(route, /layout: 'rotation'/);
});

test('system stage stays transparent during idle and transient recovery', () => {
  const overlay = readFileSync(new URL('../src/app/overlay/game-hub/[profileId]/page.tsx', import.meta.url), 'utf8');
  assert.match(overlay, /hasLoadedProfile/);
  assert.match(overlay, /profileId\.startsWith\('system-'\)/);
  assert.match(overlay, /data-nebula-state="recovering"/);
  assert.match(overlay, /!renderedGames\.length && !profile\.transparent/);
});

test('spmt leaderboard queues a main-display card and the overlay holds it for 15 seconds', () => {
  const command = readFileSync(new URL('../src/app/api/game-hub/command/route.ts', import.meta.url), 'utf8');
  const botPatch = readFileSync(new URL('../scripts/patch-game-hub-bot.mjs', import.meta.url), 'utf8');
  const overlay = readFileSync(new URL('../src/app/overlay/[userId]/page.tsx', import.meta.url), 'utf8');
  assert.match(command, /overlayEvent:[\s\S]*type: 'leaderboard-card'/);
  assert.match(botPatch, /gamesHubCommand\?\.overlayEvent\?\.type/);
  assert.match(overlay, /case 'leaderboard-card':[\s\S]*sound: 'leaderboard'/);
  assert.match(overlay, /queueBroadcast\(built, built\.type === 'history' \? 15000/);
});

test('Word Chain and Phrase Guess use six-minute stage rounds with minimal embedded chrome', () => {
  const wordChain = readFileSync(new URL('../public/nebula-arcade/games/wordchain.html', import.meta.url), 'utf8');
  const phraseGuess = readFileSync(new URL('../public/nebula-arcade/games/phraseguess.html', import.meta.url), 'utf8');
  assert.match(wordChain, /const ROUND_SECONDS = 6 \* 60/);
  assert.match(wordChain, /const ROUNDS_PER_CYCLE = 5/);
  assert.match(wordChain, /body\.embedded #scoreboard/);
  assert.match(phraseGuess, /const ROUND_DURATION_MS = 6 \* 60 \* 1000/);
  assert.match(phraseGuess, /const HINT_COSTS = \[10, 25, 50\]/);
  assert.match(phraseGuess, /body\.embedded \.controls/);
  assert.match(phraseGuess, /if \(embedded\)[\s\S]*startGame\(\)/);
});
