const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, req, globals = {}) {
  const m = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module: m, exports: m.exports, require: req, console, process, Date,
    Map, Set, Buffer, structuredClone, setTimeout, clearTimeout, ...globals });
  return m.exports;
}
const hub = load('src/lib/game-hub-state.ts', id => id.includes('game-hub-registry')
  ? { getGameHubGame: id => ({ id }), GAME_HUB_CATALOG: [] } : {});
const { awardCheckinNebulaBonus } = load('src/lib/checkin-nebula-bonus.ts', id =>
  id === 'node:crypto' ? require(id) : hub);
const input = { awardId: 'message-one', channel: 'host', userId: '123', username: 'alice', displayName: 'Alice' };

test('front-seat bonus increases the shared wallet and lifetime earned, leaving individual game scores unchanged', () => {
  const state = { tagPlayers: { user_123: { score: 25 } } };
  const player = hub.getOrCreateGameHubPlayer(state, input);
  player.gamePointsBalance = 230;
  player.lifetimeEarned = 300;
  player.lifetimeSpent = 70;
  player.joinedGames.wordchain = { joinedAt: '2026-01-01', active: true, score: 19, wins: 2, plays: 4 };
  const award = awardCheckinNebulaBonus(state, input);
  const saved = hub.getGameHubStore(state);
  assert.equal(award.amount, 100);
  assert.equal(award.currency, 'nebula');
  assert.equal(award.balance, 330);
  assert.equal(saved.players['twitch:123'].lifetimeEarned, 400);
  assert.equal(saved.players['twitch:123'].lifetimeSpent, 70);
  assert.equal(saved.players['twitch:123'].joinedGames.wordchain.score, 19);
  assert.equal(state.tagPlayers.user_123.score, 25);
  assert.equal(saved.ledger.length, 1);
  assert.equal(saved.ledger[0].amount, 100);
});

test('concurrent duplicate delivery and process reload credit a check-in exactly once on the real volume store', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-checkin-test-'));
  const open = () => load('src/lib/volume-store.ts', require, { process: { env: { DATA_DIR: dir }, cwd: () => dir } });
  try {
    const volume = open();
    const results = await Promise.all(Array.from({ length: 4 }, () =>
      volume.updateAppState(state => awardCheckinNebulaBonus(state, input))));
    assert.equal(results.filter(r => !r.duplicate).length, 1);
    const reloaded = open();
    const replay = await reloaded.updateAppState(state => awardCheckinNebulaBonus(state, input));
    assert.equal(replay.duplicate, true);
    const state = await reloaded.readAppState();
    assert.equal(hub.getGameHubStore(state).players['twitch:123'].gamePointsBalance, 100);
    assert.equal(hub.getGameHubStore(state).ledger.length, 1);
    await reloaded.updateAppState(state => awardCheckinNebulaBonus(state, { ...input, awardId: 'message-two' }));
    assert.equal(hub.getGameHubStore(await reloaded.readAppState()).players['twitch:123'].gamePointsBalance, 200);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the same check-in cannot be reused to pay a different rider', () => {
  const state = {};
  awardCheckinNebulaBonus(state, input);
  assert.throws(() => awardCheckinNebulaBonus(state, { ...input, userId: '456', username: 'bob' }), /another rider/);
  assert.equal(Object.keys(hub.getGameHubStore(state).players).length, 1);
});

function endpoint({ authorized = true, lookup = async () => null, save = async callback => callback({}) } = {}) {
  return load('src/app/api/game-hub/checkin-bonus/route.ts', id => {
    if (id === 'next/server') return { NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) } };
    if (id === 'zod') return require('zod');
    if (id.endsWith('/auth')) return { isBotRequest: () => authorized, isStreamWeaverGameHubRequest: () => false };
    if (id.endsWith('/volume-store')) return { updateAppState: save };
    if (id.endsWith('/twitch')) return { lookupTwitchUser: lookup };
    if (id.endsWith('/checkin-nebula-bonus')) return { awardCheckinNebulaBonus };
    throw Error(id);
  }, { console: { info() {}, error() {} } });
}
const request = body => ({ json: async () => body });

test('bonus endpoint requires service authority and refuses caller-selected amounts', async () => {
  const save = () => { throw Error('Must not write'); };
  assert.equal((await endpoint({ authorized: false, save }).POST(request(input))).status, 401);
  assert.equal((await endpoint({ save }).POST(request({ ...input, amount: 10000 }))).status, 400);
  assert.equal((await endpoint({ save }).POST(request({ ...input, username: 'invalid/name' }))).status, 400);
});

test('a missing numeric ID resolves to the real Twitch wallet and never creates a login-only wallet', async () => {
  const state = {};
  const response = await endpoint({
    lookup: async login => { assert.equal(login, 'alice'); return { id: '123', login: 'alice' }; },
    save: async callback => callback(state),
  }).POST(request({ ...input, userId: 'manual_alice' }));
  assert.equal(response.status, 200);
  assert.equal(response.body.award.playerId, 'twitch:123');
  assert.equal(hub.getGameHubStore(state).players['login:alice'], undefined);
  assert.equal((await endpoint().POST(request({ ...input, userId: '' }))).status, 503);
});

test('a failed wallet write cannot return a successful award', async () => {
  const response = await endpoint({ save: async () => { throw Error('Disk write failed'); } }).POST(request(input));
  assert.equal(response.status, 500);
  assert.equal(response.body.award, undefined);
});
