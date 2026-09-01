import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('bot keeps Games Hub events realtime while throttling Chat Tag persistence', () => {
  const patch = read('scripts/patch-live-chat-pressure.mjs');
  const dockerfile = read('Dockerfile.bot');

  assert.match(patch, /Games Hub gameplay events stay realtime; Chat Tag persistence stays throttled/);
  assert.match(patch, /CHAT_ACTIVITY_THROTTLE_MS \|\| '60000'/);
  assert.match(patch, /api\/game-hub\/chat/);
  assert.match(patch, /if \(shouldForwardChatActivity\(senderUserId, resolvedChannel\)\)/);
  assert.match(patch, /action: 'chat-activity'/);
  assert.match(dockerfile, /patch-live-chat-pressure\.mjs/);
  assert.ok(
    dockerfile.indexOf('patch-live-chat-pressure.mjs') > dockerfile.indexOf('patch-game-hub-bot.mjs'),
    'pressure patch must run after the Games Hub compatibility patch',
  );
});

test('Games Hub chat skips the volume write when no game is running', () => {
  const route = read('src/app/api/game-hub/chat/route.ts');
  const activeGameRead = route.indexOf('resolveChannelGameIds(snapshot, channel)');
  const noGameReturn = route.indexOf("reason: 'no-active-games'");
  const write = route.indexOf('await updateAppStateIfChanged');

  assert.ok(activeGameRead >= 0 && noGameReturn > activeGameRead, 'the active-game preflight must exist');
  assert.ok(write > noGameReturn, 'the no-game response must return before the volume write');
  assert.match(route, /scoreWriteDue/);
  assert.match(route, /scoreWriteDue\s*\?\s*await updateAppStateIfChanged/);
  assert.match(route, /appendNebulaChatEvent/);
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

test('volume state is cached and persisted as compact JSON', () => {
  const store = read('src/lib/volume-store.ts');
  assert.match(store, /let cachedState: AppState \| null = null/);
  assert.match(store, /if \(cachedState\) return cachedState/);
  assert.match(store, /const state = structuredClone\(await readState\(\)\)/);
  assert.match(store, /const payload = JSON\.stringify\(state\);/);
  assert.match(store, /export async function updateAppStateIfChanged/);
});

test('no-op chat and announcement heartbeats skip full-state writes', () => {
  const tagRoute = read('src/app/api/tag/route.ts');
  const announcementRoute = read('src/app/api/bot/live-announcement/route.ts');

  assert.match(tagRoute, /if \(!player\) return \{ changed: false, result: false \}/);
  assert.match(tagRoute, /updateAppStateIfChanged/);
  assert.match(announcementRoute, /previousKey === streamKey/);
  assert.match(announcementRoute, /return \{ changed: false, result: false \}/);
});

test('health response exposes state-store pressure diagnostics without reading the volume', () => {
  const health = read('src/app/api/health/route.ts');
  const store = read('src/lib/volume-store.ts');

  assert.match(health, /volumeStore: getVolumeStoreDiagnostics\(\)/);
  assert.match(store, /queuedUpdates/);
  assert.match(store, /lastWriteMs/);
  assert.match(store, /stateFileBytes/);
});
