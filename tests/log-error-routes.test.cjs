const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function route(path, mocks) {
  const module = { exports: {} };
  const source = fs.readFileSync(path, 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: id => mocks[id] || {}, console: { log() {}, warn() {}, error() {} }, process, Date, AbortSignal, Buffer, URL });
  return module.exports;
}
const json = (body, init) => ({ body, status: init?.status || 200 });
test('pack presentation acknowledges before slow Discord/render work and edits the same message', async () => {
  const after = [], calls = [];
  const api = route('src/app/api/quackverse/pack/present/route.ts', {
    'next/server': { NextResponse: { json }, after: callback => after.push(callback) },
    '@/lib/auth': { isBotRequest: request => request.authorized },
    '@/lib/discord-webhooks': {
      sendDiscordMessage: async input => { calls.push(['send', input]); return { ok: true, messageId: 'message-1' }; },
      scheduleDiscordMessageCleanup: (...args) => calls.push(['cleanup', ...args]),
    },
    '@/lib/discord-message-edit': { editDiscordSentMessage: async input => { calls.push(['edit', input]); return true; } },
    '@/lib/quackverse-pack-media': {
      createQuackversePackMediaEvent: input => input,
      queueQuackversePackGif: async () => calls.push(['queue']),
      waitForQuackversePackGifResult: async () => ({ gifUrl: 'https://example.test/pack.gif', attempts: 1 }),
    },
  });
  const body = { packId: 'existing-draw', username: 'viewer', pack: [{ id: 1, name: 'Duck' }] };
  assert.equal((await api.POST({ authorized: false, json: async () => body })).status, 401);
  assert.equal((await api.POST({ authorized: true, json: async () => ({}) })).status, 400);
  const result = await api.POST({ authorized: true, json: async () => body });
  assert.equal(result.status, 202);
  assert.equal(result.body.queued, true);
  assert.equal(calls.length, 0);
  assert.equal(after.length, 1);
  await after[0]();
  assert.deepEqual(calls.map(call => call[0]), ['send', 'queue', 'edit', 'cleanup']);
  assert.equal(calls[2][1].result.messageId, 'message-1');
});
test('overlay-only channels use the same login identity as the channel overlay page', async () => {
  const state = { tagPlayers: { user_1: { twitchUsername: 'tagplayer' } }, overlayMessages: {} };
  const api = route('src/app/api/overlay/messages/route.ts', {
    'next/server': { NextResponse: { json } },
    '@/lib/volume-store': { updateAppState: async fn => fn(state), readAppState: async () => state, makeId: () => 'test' },
    '@/lib/chat-tag-crowns': { getWinners: () => [], decorateCrowns: message => message, decorateCrownsDeep: value => value },
  });
  for (const [channel, expected] of [['#SpaceMountainLive', 'spacemountainlive'], ['TagPlayer', 'user_1']]) {
    const result = await api.POST({ json: async () => ({ channel, message: 'hello' }) });
    assert.equal(result.status, 200);
    assert.equal(result.body.userId, expected);
    const read = await api.GET({ nextUrl: new URL(`https://example.test/?userId=${expected}`) });
    assert.equal(read.body.messages[0].message, 'hello');
  }
});
test('parade settlement cannot overlap while the previous request is pending', async () => {
  const source = fs.readFileSync(process.env.BOT_FILE || 'bot.js', 'utf8');
  const start = source.indexOf('  let danceSettlementPending = false;');
  const end = source.indexOf('  const client = new tmi.Client(', start);
  let resolve, calls = 0;
  const context = vm.createContext({ AbortSignal, apiCall: () => { calls++; return new Promise(done => { resolve = done; }); } });
  vm.runInContext(source.slice(start, end), context);
  const first = context.settleDanceParties();
  await context.settleDanceParties();
  assert.equal(calls, 1);
  resolve({ ended: [] }); await first;
  const next = context.settleDanceParties();
  assert.equal(calls, 2);
  resolve({ ended: [] }); await next;
  assert.doesNotMatch(source, /console\.log\([^\n]*token\.(?:substring|slice)/i);
});
