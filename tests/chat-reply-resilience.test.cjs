'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createMessageDeduper, createReadCache } = require('../scripts/lib/twitch-transport.cjs');

test('shared-chat copies use the source room and source ID; new identical commands remain valid', () => {
  const gate = createMessageDeduper();
  assert.equal(gate.accept('#source', { id: 'original', 'room-id': '1', 'source-id': 'original', 'source-room-id': '1' }), true);
  assert.equal(gate.accept('#mirror', { id: 'copy', 'room-id': '2', 'source-id': 'original', 'source-room-id': '1' }), false);
  assert.equal(gate.accept('#source', { id: 'new-command', 'room-id': '1' }), true);
  assert.equal(gate.accept('#source', {}), true);
  assert.equal(gate.accept('#source', {}), true);
});

test('dedup retains delayed copies, expires, and has a bounded working set', () => {
  let at = 0;
  const gate = createMessageDeduper({ now: () => at, maxEntries: 2 });
  assert.equal(gate.accept('room', { id: 'a' }), true);
  at = 6000;
  assert.equal(gate.accept('room', { id: 'a' }), false);
  gate.accept('room', { id: 'b' });
  gate.accept('room', { id: 'c' });
  assert.equal(gate.accept('room', { id: 'a' }), true);
  at += 120001;
  assert.equal(gate.accept('room', { id: 'a' }), true);
});

test('concurrent reads share one request and successful empty results are cached', async () => {
  let calls = 0, release;
  const cache = createReadCache({ load: () => { calls++; return new Promise(r => { release = r; }); } });
  const one = cache.read(), two = cache.read(true);
  await Promise.resolve();
  assert.equal(calls, 1);
  release([]);
  assert.deepEqual(await one, []);
  assert.deepEqual(await two, []);
  await cache.read();
  assert.equal(calls, 1);
});

test('failed refresh retains last-good membership, backs off, and stops using expired data', async () => {
  let at = 1, calls = 0;
  const members = [{ twitchUsername: 'source', isSharedChat: true }];
  const cache = createReadCache({ now: () => at, ttlMs: 30, retryMs: 10, maxStaleMs: 100,
    load: () => { calls++; return calls === 1 ? members : null; } });
  assert.equal(await cache.read(), members);
  at = 40;
  assert.equal(await cache.read(), members);
  assert.equal(await cache.read(true), members);
  assert.equal(calls, 2);
  at = 102;
  assert.equal(await cache.read(), null);
  assert.equal(cache.peek(), null);
});

test('permission cache fails closed after its short validity window', async () => {
  let at = 1, allowed = true;
  const cache = createReadCache({ now: () => at, ttlMs: 5, maxStaleMs: 5,
    load: () => allowed ? new Set(['muted']) : null });
  assert.equal((await cache.read()).has('muted'), true);
  at = 7; allowed = false;
  assert.equal(await cache.read(), null);
});

function replyHarness({ shared = false, muted = false } = {}) {
  const source = fs.readFileSync(require.resolve('../bot.js'), 'utf8');
  const fragment = source.slice(source.indexOf('const liveMembersRead ='), source.indexOf('async function resolveChannelFromRoomId'));
  const calls = [];
  const context = { createReadCache, Map, Set, Date,
    liveMembersCache: { map: new Map() },
    observedSharedChannels: new Map(shared ? [['source', Date.now()]] : []),
    apiCall: () => new Promise(() => {}), recordRecentlyLiveChannels() {},
    withCrowns: async value => value,
    getMutedChannelsCached: async () => muted ? new Set(['source']) : new Set(),
    sendOverlayMessage: async () => { calls.push('overlay'); },
    sendMessageViaAPI: async () => { calls.push('source-only'); return { success: true }; },
    sourceOnlyWarnedAt: new Map(), SOURCE_ONLY_WARNING_COOLDOWN_MS: 60000, MUTED_CHANNELS_CACHE_MS: 5000,
  };
  vm.createContext(context);
  vm.runInContext(fragment, context);
  const client = { say: async () => { calls.push('irc'); } };
  return { calls, reply: () => context.sendChatWithSharedFallback(client, 'source', 'hello', { knownMuted: muted, knownMutedAt: Date.now() }) };
}

test('actual reply path does not wait for a stalled live-members request', async () => {
  const h = replyHarness();
  await Promise.race([h.reply(), new Promise((_, reject) => { const t = setTimeout(() => reject(new Error('reply_blocked')), 100); t.unref(); })]);
  assert.deepEqual(h.calls, ['irc']);
});

test('observed shared-chat replies remain source-only while membership API is stalled', async () => {
  const h = replyHarness({ shared: true });
  await h.reply();
  assert.deepEqual(h.calls, ['source-only']);
});

test('muted channels receive overlay delivery only', async () => {
  const h = replyHarness({ muted: true });
  await h.reply();
  assert.deepEqual(h.calls, ['overlay']);
});
