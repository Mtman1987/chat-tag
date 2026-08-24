import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('bot throttles volume-backed chat heartbeats without throttling DSH events', () => {
  const bot = read('bot.js');
  const dshForward = bot.indexOf("forwardToDSH({ type: 'chat'");
  const throttle = bot.indexOf('if (shouldForwardChatActivity(senderUserId, resolvedChannel))');
  const gameHubWrite = bot.indexOf("apiCall('/api/game-hub/chat'", throttle);
  const tagWrite = bot.indexOf("apiCall('/api/tag'", throttle);

  assert.ok(dshForward >= 0, 'DSH chat forwarding must remain present');
  assert.ok(throttle > dshForward, 'only volume-backed API writes should be throttled');
  assert.ok(gameHubWrite > throttle && tagWrite > throttle, 'both volume-backed writes must share the throttle');
  assert.match(bot, /CHAT_ACTIVITY_THROTTLE_MS \|\| '15000'/);
});

test('Games Hub chat skips the volume write when no game is running', () => {
  const route = read('src/app/api/game-hub/chat/route.ts');
  const activeGameRead = route.indexOf('resolveChannelGameIds(snapshot, channel)');
  const noGameReturn = route.indexOf("reason: 'no-active-games'");
  const write = route.indexOf('const activity = await updateAppState');

  assert.ok(activeGameRead >= 0 && noGameReturn > activeGameRead, 'the active-game preflight must exist');
  assert.ok(write > noGameReturn, 'the no-game response must return before the volume write');
});

test('live-member Twitch calls run outside the shared volume update lock', () => {
  const route = read('src/app/api/discord/live-members/route.ts');
  const twitchFetch = route.indexOf('await fetchTwitchLiveData(channels)');
  const stateWrite = route.indexOf('await updateAppState');

  assert.ok(twitchFetch >= 0, 'the live-member route must query Twitch');
  assert.ok(stateWrite > twitchFetch, 'the external Twitch wait must finish before taking the write lock');
  assert.doesNotMatch(route, /updateAppState\(async \(state\)/);
});

test('deployed bot allows realistic API and live-roster response times', () => {
  const patch = read('scripts/patch-game-hub-bot.mjs');
  assert.match(patch, /CHAT_TAG_API_TIMEOUT_MS \|\| '10000'/);
  assert.match(patch, /CHAT_TAG_SLOW_API_TIMEOUT_MS \|\| '45000'/);
  assert.match(patch, /endpoint === '\/api\/discord\/live-members'/);
});

test('Twitch requests have a bounded upstream timeout', () => {
  const source = read('src/lib/twitch-live-data.ts');
  assert.match(source, /TWITCH_API_TIMEOUT_MS \|\| '8000'/);
  assert.match(source, /AbortSignal\.timeout\(timeoutMs\)/);
});
