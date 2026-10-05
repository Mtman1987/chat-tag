const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../src/lib/game-hub-state.ts');
const commands = require('../src/lib/game-hub-commands.ts');
const registry = require('../src/lib/game-hub-registry.ts');

function harness(now) {
  let state = { gameSettings: { default: {} } };
  const actions = [];
  const identity = { userId: '1', username: 'alice', displayName: 'Alice', channel: 'tenant' };
  engine.setChannelGameRunning(state, 'tenant', 'wordchain', true);
  engine.setChannelGameRunning(state, 'tenant', 'phraseguess', true);
  engine.setChannelGameRunning(state, 'tenant', 'pixelbattle', true);
  engine.joinGameHubGame(state, { ...identity, gameId: 'wordchain' });
  engine.recordWordChainMessage(state, { ...identity, message: 'raccoon', now: now - engine.WORD_CHAIN_ROUND_MS });
  const read = () => state;
  const update = async fn => { const draft = structuredClone(state); const result = fn(draft); state = draft; return result; };
  const updateIfChanged = async fn => { const draft = structuredClone(state); const { changed, result } = fn(draft); if (changed) state = draft; return result; };
  function load(file) {
    const m = { exports: {} };
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      module: m, exports: m.exports, URLSearchParams, console, process, Buffer, setTimeout,
      Date: class extends Date { static now() { return now; } },
      require: id => {
        if (id === 'next/server') return { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } };
        if (id === '@/lib/auth') return { isBotRequest: () => true, isStreamWeaverGameHubRequest: () => false };
        if (id === '@/lib/game-hub-state') return { ...engine,
          recordWordChainMessage: (state, input) => engine.recordWordChainMessage(state, { ...input, now }),
          recordWordChainVote: (state, input) => engine.recordWordChainVote(state, { ...input, now }) };
        if (id === '@/lib/game-hub-commands') return commands;
        if (id === '@/lib/game-hub-registry') return registry;
        if (id === '@/lib/volume-store') return { readAppState: async () => state, updateAppState: update, updateAppStateIfChanged: updateIfChanged };
        if (id === '@/lib/game-hub-runtime') return { recordGameHubRuntimeAction: (state, input) => actions.push(input) };
        if (id === '@/lib/public-origin') return { getPublicAppOrigin: () => 'https://example.test' };
        if (id === '@/lib/game-hub-chat-summary') return { fitCompactReplyWithLink: text => text };
        if (id === '@/lib/nebula-mosaic') return { mosaicPublicSnapshot: () => ({}), parseMosaicPaintCommand: () => null, parseMosaicBrushCommand: () => null, parseMosaicViewCommand: () => null };
        if (id === '@/lib/game-hub-event-bus') return { getNebulaChatEvents: () => [] };
        if (id === '@/lib/nebula-rotation') return { nebulaRotationIndexAt: (now, count) => 1 % count };
        if (id === '@/lib/dancing-parade') return { getDancingParadeSnapshot: () => ({ active: false }) };
        return {};
      },
    });
    return m.exports;
  }
  return { load, read, actions, request: message => ({ json: async () => ({ ...identity, message }) }) };
}

test('actual command transaction accepts down by word/number while Phrase Guess is displayed', async () => {
  const h = harness(engine.WORD_CHAIN_ROUND_MS);
  const { POST } = h.load('src/app/api/game-hub/command/route.ts');
  for (const command of ['spmt down 1', 'spmt up RACCOON', 'spmt chain down #1', 'spmt wordchain up 1']) {
    const result = await POST(h.request(command));
    assert.match(result.body.reply, /vote recorded/);
  }
  assert.equal(h.actions.length, 4);
  assert.equal(h.actions[0].gameId, 'wordchain');
  assert.equal(h.actions[0].action, 'down');
  assert.equal(engine.getChannelGameSettings(h.read(), 'tenant').wordChainRound.entries[0].votes['twitch:1'], true);
});

test('actual theme commands accept names and seeded custom themes and report queue position', async () => {
  const h = harness(engine.WORD_CHAIN_ROUND_MS);
  const { POST } = h.load('src/app/api/game-hub/command/route.ts');
  for (const [command, expected] of [['spmt chain theme Dinosaurs', /the next round/], ['spmt chain theme Weather: storm, rain, snow, thunder', /upcoming round #2/]]) {
    const result = await POST(h.request(command));
    assert.match(result.body.reply, expected);
  }
  assert.deepEqual(engine.getChannelGameSettings(h.read(), 'tenant').wordChainThemeQueue, ['dinosaurs', 'weather']);
});

test('lifecycle settles and retains tenant results without overlay polling, then acknowledges once', async () => {
  const now = engine.WORD_CHAIN_ROUND_MS + engine.WORD_CHAIN_REVIEW_MS;
  const h = harness(now);
  const { POST } = h.load('src/app/api/game-hub/lifecycle/route.ts');
  const request = body => ({ json: async () => body });
  const first = await POST(request({}));
  assert.equal(first.body.wordChainResults.length, 2);
  assert.match(first.body.wordChainResults[0].message, /Alice \(7 pts\)/);
  const second = await POST(request({}));
  assert.deepEqual(second.body.wordChainResults, first.body.wordChainResults);
  assert.equal(engine.getGameHubStore(h.read()).players['twitch:1'].gamePointsBalance, 7);
  await POST(request({ acknowledgedResults: first.body.wordChainResults.map(event => event.id), ackOnly: true }));
  assert.equal((await POST(request({}))).body.wordChainResults.length, 0);
});

test('short and namespaced guesses return spelling feedback instead of accepting joined words', async () => {
  const h = harness(0);
  const { POST } = h.load('src/app/api/game-hub/command/route.ts');
  const settings = engine.getChannelGameSettings(h.read(), 'tenant');
  settings.wordChainRound.currentWord = 'LEAF';
  const explicit = await POST(h.request('spmt wordchain frenchhorn'));
  assert.match(explicit.body.reply, /not a recognized single word/);
  engine.setChannelGameRunning(h.read(), 'tenant', 'phraseguess', false);
  engine.setChannelGameRunning(h.read(), 'tenant', 'pixelbattle', false);
  const short = await POST(h.request('spmt frenchhorn'));
  assert.match(short.body.reply, /not a recognized single word/);
  assert.equal(engine.getChannelGameSettings(h.read(), 'tenant').wordChainRound.currentWord, 'LEAF');
});
