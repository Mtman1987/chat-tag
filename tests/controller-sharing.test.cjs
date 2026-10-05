const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, deps = {}, globals = {}) {
  const m = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: m, exports: m.exports, Buffer, URL, Headers, AbortSignal, structuredClone, console, process, setTimeout,
    require: id => id in deps ? deps[id] : require(id), ...globals,
  });
  return m.exports;
}
const next = { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200, headers: init?.headers }) } };
function themeHarness(fetcher) {
  let now = 1_000_000;
  const route = load('src/app/api/spmt/workspace-theme/route.ts', { 'next/server': next, '@spmt/sdk': { workspaceThemeTokens: profile => ({ themeId: profile.id }) } }, {
    fetch: fetcher, Date: class extends Date { static now() { return now; } }, console: { warn() {} },
  });
  return { get: (token = 'one') => route.GET({ cookies: { get: () => ({ value: token }) } }), advance: () => { now += 16_000; } };
}
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
test('socket failures are retried once and return controlled 503', async () => {
  let calls = 0;
  const h = themeHarness(async (url, options) => { calls++; assert.ok(options.signal); throw new Error('socket closed'); });
  const result = await h.get();
  assert.equal(result.status, 503); assert.equal(calls, 6); assert.equal(result.headers['Retry-After'], '15');
});
test('optional upstream failures do not discard a valid theme', async () => {
  const h = themeHarness(async url => { if (url.endsWith('workspace-profile')) return response(200, { profile: { id: 'violet' } }); throw new Error('socket closed'); });
  const result = await h.get(); assert.equal(result.status, 200); assert.equal(result.body.tokens.themeId, 'violet'); assert.equal(result.body.partial, true);
});
test('theme requests coalesce; stale fallback is session-specific and never used after 401', async () => {
  let failure = false, unauthorized = false, calls = 0;
  const h = themeHarness(async url => { calls++; if (unauthorized) return response(401, {}); if (failure) throw new Error('socket closed'); return response(200, url.endsWith('workspace-profile') ? { profile: { id: 'one' } } : {}); });
  const [a, b] = await Promise.all([h.get(), h.get()]);
  assert.equal(a.status, 200); assert.equal(b.status, 200); assert.equal(calls, 3);
  h.advance(); failure = true;
  assert.equal((await h.get()).body.stale, true);
  assert.equal((await h.get('another-session')).status, 503);
  unauthorized = true;
  assert.equal((await h.get()).status, 401);
  unauthorized = false;
  assert.equal((await h.get()).status, 503);
});
test('malformed successful profile is 502, not a false HTTP 200', async () => {
  const h = themeHarness(async () => response(200, {})); assert.equal((await h.get()).status, 502);
});
function discordHarness() {
  let state = { discordWebhooks: {} }, now = 1_000_000, version = 1;
  const calls = [];
  let mode = 'ok', deferred;
  const service = load('src/lib/game-discord-connections.ts', {
    '@/lib/volume-store': { readAppState: async () => state, updateAppState: async fn => fn(state), updateAppStateIfChanged: async fn => fn(state).result },
    '@/lib/runtime-secrets': { getSessionSecret: () => 'test-secret' },
    '@/lib/game-discord-cards': { buildGameDiscordCard: () => ({ embeds: [{ title: `Version ${version}` }], allowed_mentions: { parse: [] } }) },
  }, {
    Date: class extends Date { static now() { return now; } },
    fetch: async (url, init) => {
      calls.push({ url, init }); assert.equal(init.redirect, 'error'); assert.ok(init.signal);
      if (!init.method) return response(200, { id: '123', type: 1, channel_id: '456', name: 'Test game' });
      if (mode === 'timeout') throw new Error('secret-url must never leak');
      if (mode === 'limit') return response(429, { retry_after: 90 });
      if (mode === 'defer') await new Promise(resolve => { deferred = resolve; });
      if (mode === 'missing') return response(404, { code: 10008 });
      return response(200, { id: '789' });
    },
  });
  return { service, calls, state, advance: (ms = 31_000) => { now += ms; }, change: () => { version++; }, mode: m => { mode = m; }, release: () => deferred?.() };
}
const webhook = 'https://discord.com/api/webhooks/123/secret_test_token';
test('webhook validation rejects alternate hosts, credentials, redirects and thread query strings', () => {
  const { service } = discordHarness();
  assert.equal(service.normalizeGameWebhook(webhook), 'https://discord.com/api/v10/webhooks/123/secret_test_token');
  for (const invalid of ['http://discord.com/api/webhooks/123/token', 'https://evil.test/api/webhooks/123/token', 'https://discord.com.evil.test/api/webhooks/123/token', 'https://user:pass@discord.com/api/webhooks/123/token', webhook + '?thread_id=7', webhook + '#fragment']) assert.throws(() => service.normalizeGameWebhook(invalid));
});
test('save encrypts URL, sends once, returns no secrets and edits existing card only on change', async () => {
  const h = discordHarness(); const result = await h.service.saveGameDiscordConnection('alice', 'pixelbattle', webhook);
  assert.equal(result.status, 'connected'); assert.doesNotMatch(JSON.stringify(result), /secret_test_token|ciphertext|sealed/);
  assert.doesNotMatch(JSON.stringify(h.state), /secret_test_token/);
  assert.equal(h.calls.filter(c => c.init.method === 'POST').length, 1);
  h.advance(); await h.service.syncGameDiscordConnections(); assert.equal(h.calls.length, 2);
  h.advance(); h.change(); await h.service.syncGameDiscordConnections();
  assert.equal(h.calls.at(-1).init.method, 'PATCH'); assert.match(h.calls.at(-1).url, /\/messages\/789$/);
  assert.equal(h.calls.filter(c => c.init.method === 'POST').length, 1);
  await h.service.saveGameDiscordConnection('alice', 'pixelbattle', webhook);
  assert.equal(h.calls.filter(c => c.init.method === 'POST').length, 1);
});
test('uncertain initial delivery pauses instead of duplicating on the next tick', async () => {
  const h = discordHarness(); h.mode('timeout');
  const result = await h.service.saveGameDiscordConnection('alice', 'pixelbattle', webhook);
  assert.equal(result.status, 'paused'); assert.doesNotMatch(result.error, /secret-url/);
  h.advance(); await h.service.syncGameDiscordConnections(); assert.equal(h.calls.filter(c => c.init.method === 'POST').length, 1);
});
test('leases prevent concurrent sends and edits after disconnect', async () => {
  const h = discordHarness(); h.mode('defer');
  const save = h.service.saveGameDiscordConnection('alice', 'pixelbattle', webhook);
  await new Promise(resolve => setTimeout(resolve, 5));
  await h.service.syncGameDiscordConnections();
  await assert.rejects(() => h.service.removeGameDiscordConnection('alice', 'pixelbattle'), /being updated/);
  h.release(); await save;
  assert.equal(h.calls.filter(c => c.init.method === 'POST').length, 1);
  await h.service.removeGameDiscordConnection('alice', 'pixelbattle'); h.advance(); h.change(); await h.service.syncGameDiscordConnections();
  assert.equal((await h.service.getGameDiscordConnection('alice', 'pixelbattle')).configured, false);
  assert.equal(h.calls.length, 2);
});
test('Discord rate limits delay retries', async () => {
  const h = discordHarness(); h.mode('limit'); await h.service.saveGameDiscordConnection('alice', 'wordchain', webhook);
  h.advance(); await h.service.syncGameDiscordConnections(); assert.equal(h.calls.length, 2);
  h.advance(61_000); h.mode('ok'); await h.service.syncGameDiscordConnections(); assert.equal(h.calls.length, 3);
});
test('deleted card is recreated once on the next tick', async () => {
  const h = discordHarness(); await h.service.saveGameDiscordConnection('alice', 'pixelbattle', webhook);
  h.advance(); h.change(); h.mode('missing'); await h.service.syncGameDiscordConnections();
  h.advance(); h.mode('ok'); await h.service.syncGameDiscordConnections();
  assert.equal(h.calls.filter(c => c.init.method === 'POST').length, 2);
});
test('controller connections require channel ownership or verified admin', () => {
  let user = { twitchUsername: 'alice' };
  const access = load('src/lib/controller-access.ts', { '@/lib/auth': { getSessionUserFromRequest: () => user }, '@/lib/game-hub-catalog': { getGameHubGame: id => id === 'wordchain' ? { id } : null } });
  const req = admin => ({ headers: new Headers(admin ? { 'x-spmt-is-admin': '1' } : {}) });
  assert.equal(access.controllerAccess(req(false), { channel: 'bob', gameId: 'wordchain' }).status, 403);
  assert.equal(access.controllerAccess(req(false), { channel: 'alice', gameId: 'wordchain' }).ok, true);
  assert.equal(access.controllerAccess(req(true), { channel: 'bob', gameId: 'wordchain' }).ok, true);
  user = null; assert.equal(access.controllerAccess(req(false), { channel: 'alice', gameId: 'wordchain' }).status, 401);
});

test('game cards use public puzzle snapshots and disable Discord mentions', () => {
  const card = load('src/lib/game-discord-cards.ts', {
    '@/lib/game-hub-catalog': { getGameHubGame: id => ({ id, name: 'Test game', howToPlay: 'Play along.' }) },
    '@/lib/game-hub-commands': { canonicalPlayerCommands: () => [] },
    '@/lib/game-hub-state': { resolveChannelGameIds: () => ['phraseguess', 'wordchain'], getGameHubGameStats: () => ({ leaderboard: [] }), phraseGuessPublicSnapshot: () => ({ solved: false, maskedPhrase: '•••' }), wordChainPublicSnapshot: () => ({ roundNumber: 1, phase: 'play', theme: 'animals', currentWord: 'cat', requiredLetter: 't', chainLength: 1 }) },
    '@/lib/nebula-mosaic': { mosaicPublicSnapshot: () => ({ artwork: null }) },
    '@/lib/public-origin': { getPublicAppOrigin: () => 'https://chat-tag.test' },
  });
  const result = card.buildGameDiscordCard({ secretAnswer: 'hidden-answer' }, 'alice', 'phraseguess');
  assert.doesNotMatch(JSON.stringify(result), /hidden-answer/);
  assert.match(JSON.stringify(result), /•••/);
  assert.equal(result.allowed_mentions.parse.length, 0);
});
