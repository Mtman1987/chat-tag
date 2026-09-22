import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GAME_HUB_CATALOG } from '../src/lib/game-hub-registry';
import { NEBULA_GAMEPLAY_ROTATION_MS, buildChatTagEmbed, nebulaGameplayImageUrl } from '../src/lib/chat-tag-discord';
import { nebulaNextRotationDelayMs, nebulaRotationIndexAt, nebulaRotationIntervalMs } from '../src/lib/nebula-rotation';

test('showcase catalog exposes all 18 games for gameplay capture', () => {
  assert.equal(GAME_HUB_CATALOG.length, 18);
  assert.equal(new Set(GAME_HUB_CATALOG.map((game) => game.id)).size, 18);
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

test('activity stage reports active games and system surfaces use every available pixel', () => {
  const overlay = readFileSync(new URL('../src/app/overlay/game-hub/[profileId]/page.tsx', import.meta.url), 'utf8');
  const prototype = readFileSync(new URL('../src/components/game-hub-prototype-surface.tsx', import.meta.url), 'utf8');
  assert.match(overlay, /type: 'nebula\.activity-state'/);
  assert.match(overlay, /activeGamesKey = games\.map/);
  assert.match(overlay, /active: gameIds\.length > 0/);
  assert.match(overlay, /systemProfile \? 'gap-0 p-0'/);
  assert.match(prototype, /Array\.from\(\{ length: 20 \}/);
  assert.match(prototype, /Array\.from\(\{ length: 25 \}/);
  assert.match(prototype, /repeat\(20,minmax\(0,1fr\)\)/);
  assert.match(prototype, /repeat\(25,minmax\(0,1fr\)\)/);
  assert.match(prototype, /broadcastOnly \? 'grid w-full p-0'/);
});

test('Mosaic chat requests wake saved boards and start generation without the overlay', () => {
  const command = readFileSync(new URL('../src/app/api/game-hub/command/route.ts', import.meta.url), 'utf8');
  const bot = readFileSync(new URL('../bot.js', import.meta.url), 'utf8');
  const mosaic = readFileSync(new URL('../src/lib/nebula-mosaic.ts', import.meta.url), 'utf8');
  assert.match(command, /resumeMosaicIfNeeded\(draft, channel\)/);
  assert.match(bot, /mosaicGenerationQueued[\s\S]*\/api\/game-hub\/mosaic/);
  assert.match(bot, /AbortSignal\.timeout\(5 \* 60 \* 1000\)/);
  assert.match(mosaic, /recoveryVersion/);
});

test('event system games release after inactivity while an active main word game appears immediately', () => {
  const overlay = readFileSync(new URL('../src/app/overlay/game-hub/[profileId]/page.tsx', import.meta.url), 'utf8');
  assert.match(overlay, /NEBULA_ACTIVITY_IDLE_MS = 30 \* 60_000/);
  assert.match(overlay, /ALWAYS_VISIBLE_SYSTEM_PROFILES = new Set\(\['system-spacemountainlive-main', 'system-spacemountainlive-parade'\]\)/);
  assert.match(overlay, /activityNow - at > NEBULA_ACTIVITY_IDLE_MS/);
  assert.match(overlay, /profile\.id\.startsWith\('system-'\)/);
  assert.match(overlay, /!ALWAYS_VISIBLE_SYSTEM_PROFILES\.has\(profile\.id\)/);
  assert.match(overlay, /recentlyPlayed\.has\(gameId\)/);
  assert.match(overlay, /setInterval\(\(\) => setActivityNow\(Date\.now\(\)\), 15_000\)/);
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
  assert.equal((wordChain.match(/const ROUND_SECONDS = 6 \* 60/g) || []).length, 1);
  assert.match(wordChain, /const ROUNDS_PER_CYCLE = 5/);
  assert.match(wordChain, /currentRoundSlot = Math\.floor\(Date\.now\(\) \/ \(ROUND_SECONDS \* 1000\)\)/);
  assert.match(wordChain, /eventAt < roundOpenedAt/);
  assert.match(wordChain, /if \(!embedded && !participants\.has/);
  assert.match(wordChain, /body\.broadcast #scoreboard/);
  assert.doesNotMatch(wordChain, /body\.broadcast #timer,\s*body\.broadcast #theme-indicator,\s*body\.broadcast #chain-container/);
  assert.match(wordChain, /body\.broadcast #timer,\s*body\.broadcast #theme-indicator[\s\S]*font-size: clamp/);
  assert.match(phraseGuess, /const ROUND_DURATION_MS = 6 \* 60 \* 1000/);
  assert.match(phraseGuess, /const HINT_COSTS = \[10, 25, 50\]/);
  assert.match(phraseGuess, /Math\.floor\(Date\.now\(\) \/ ROUND_DURATION_MS\)/);
  assert.match(phraseGuess, /if \(!embedded\) loadSettings\(\)/);
  assert.match(phraseGuess, /if \(savedPhrases && !embedded\)/);
  assert.match(phraseGuess, /if \(embedded && !command\) wallet\.joined = true/);
  assert.match(phraseGuess, /event\.data\?\.dataReceived\?\.overlayNinja/);
  assert.match(phraseGuess, /nebula-phrase-round/);
  assert.match(phraseGuess, /body\.broadcast \.controls/);
  assert.match(phraseGuess, /if \(embedded\)[\s\S]*startGame\(\)/);
});

test('main word game broadcast stages and Chat Tag leaderboard rotation are wired', () => {
  const surface = readFileSync(new URL('../src/components/game-hub-surface.tsx', import.meta.url), 'utf8');
  const stage = readFileSync(new URL('../src/components/game-hub-word-stage.tsx', import.meta.url), 'utf8');
  const overlayState = readFileSync(new URL('../src/app/api/overlay/state/route.ts', import.meta.url), 'utf8');
  const chatTagOverlay = readFileSync(new URL('../src/app/overlay/[userId]/page.tsx', import.meta.url), 'utf8');
  const command = readFileSync(new URL('../src/app/api/game-hub/command/route.ts', import.meta.url), 'utf8');
  assert.match(surface, /GameHubWordStage/);
  assert.match(stage, /Next word starts with/);
  assert.match(stage, /Guess normally in chat/);
  assert.match(overlayState, /activeWordLeaderboard/);
  assert.match(chatTagOverlay, /current\.activeWordLeaderboard/);
  assert.match(command, /submitWordChainTheme/);
});

test('Word Chain neutral answers use a bounded parent majority vote', () => {
  const frame = readFileSync(new URL('../src/components/nebula-game-frame.tsx', import.meta.url), 'utf8');
  assert.match(frame, /neutral-word-vote/);
  assert.match(frame, /nebula-word-verdict/);
  assert.match(frame, /votes\.length === 0 \|\| yes >= no/);
  assert.match(frame, /wordVoteOpenRef/);
});
