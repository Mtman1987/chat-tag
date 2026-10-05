import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceWordChainRound, getChannelGameSettings, getGameHubStore, joinGameHubGame,
  recordWordChainMessage, recordWordChainVote, setStreamGameBattle, submitWordChainTheme,
  wordChainPublicSnapshot, WORD_CHAIN_CYCLE_MS, WORD_CHAIN_ROUND_MS, WORD_CHAIN_REVIEW_MS, WORD_CHAIN_THEMES } from '../src/lib/game-hub-state';
import { wordChainResultMessages } from '../src/lib/word-chain-results';

const player = { userId: '1', username: 'alice', displayName: 'Alice' };
const fresh = () => { const state: any = { gameSettings: { default: {} } }; joinGameHubGame(state, { ...player, gameId: 'wordchain' }); return state; };

test('tenant votes by number, #number, and word settle once, including zero-score participants', () => {
  const state = fresh();
  recordWordChainMessage(state, { ...player, channel: 'tenant', message: 'raccoon', now: 0 });
  assert.equal(recordWordChainVote(state, { ...player, channel: 'tenant', word: '1', up: false, now: WORD_CHAIN_ROUND_MS }).outcome, 'voted');
  assert.equal(recordWordChainVote(state, { ...player, channel: 'tenant', word: '#1', up: false, now: WORD_CHAIN_ROUND_MS }).outcome, 'unchanged');
  assert.equal(recordWordChainVote(state, { ...player, channel: 'tenant', word: 'raccoon', up: true, now: WORD_CHAIN_ROUND_MS }).outcome, 'voted');
  recordWordChainVote(state, { ...player, channel: 'tenant', word: 'RACCOON', up: false, now: WORD_CHAIN_ROUND_MS });
  const now = WORD_CHAIN_ROUND_MS + WORD_CHAIN_REVIEW_MS;
  advanceWordChainRound(state, 'tenant', now);
  const settings = getChannelGameSettings(state, 'tenant');
  assert.deepEqual(settings.lastWordChainTally?.leaders, [{ displayName: 'Alice', points: 0 }]);
  const events = structuredClone(settings.pendingWordChainResults);
  assert.match(events![0].message, /Alice \(0 pts\)/);
  advanceWordChainRound(state, 'tenant', now + 1);
  assert.deepEqual(settings.pendingWordChainResults, events);
  assert.equal(getGameHubStore(state).players['twitch:1'].gamePointsBalance, 0);
});

test('requested themes play next without resetting the current round; name-only starts freely', () => {
  const state = fresh();
  const original = advanceWordChainRound(state, 'tenant', 0).round;
  const request = submitWordChainTheme(state, { ...player, channel: 'tenant', name: 'Dinosaurs', words: '', now: 1 });
  assert.equal(request.queuePosition, 1);
  assert.equal(advanceWordChainRound(state, 'tenant', 2).round, original);
  assert.equal(advanceWordChainRound(state, 'tenant', WORD_CHAIN_CYCLE_MS).round.theme, 'Dinosaurs');
  assert.equal(recordWordChainMessage(state, { ...player, channel: 'tenant', message: 'raptor', now: WORD_CHAIN_CYCLE_MS }).outcome, 'accepted');
  assert.equal(recordWordChainMessage(state, { ...player, channel: 'tenant', message: 'trex', now: WORD_CHAIN_CYCLE_MS + 1 }).outcome, 'wrong-letter');
  submitWordChainTheme(state, { ...player, channel: 'tenant', name: 'Space', words: '', now: WORD_CHAIN_CYCLE_MS + 2 });
  assert.equal(advanceWordChainRound(state, 'tenant', WORD_CHAIN_CYCLE_MS * 2).round.theme, 'Space');
});

test('automatic themes do not repeat until the full catalog is used, including across game boundaries', () => {
  const state = fresh(), count = Object.keys(WORD_CHAIN_THEMES).length;
  const themes = Array.from({ length: count }, (_, index) => advanceWordChainRound(state, 'tenant', index * WORD_CHAIN_CYCLE_MS).round.theme);
  assert.equal(new Set(themes).size, count);
  const next = advanceWordChainRound(state, 'tenant', count * WORD_CHAIN_CYCLE_MS).round.theme;
  assert.notEqual(next, themes.at(-1));
});

test('linked tenants share requested themes and each get results; unrelated tenants stay isolated', () => {
  const state = fresh();
  setStreamGameBattle(state, { gameId: 'wordchain', channels: ['alpha', 'beta'], createdBy: 'alpha' });
  submitWordChainTheme(state, { ...player, channel: 'beta', name: 'Dinosaurs', words: 'raptor, trex, triceratops, stegosaurus', now: 0 });
  assert.equal(advanceWordChainRound(state, 'alpha', 0).round.theme, 'Dinosaurs');
  assert.equal(wordChainPublicSnapshot(state, 'beta', 0).theme, 'Dinosaurs');
  assert.equal(wordChainPublicSnapshot(state, 'gamma', 0).theme, 'Animals');
  recordWordChainMessage(state, { ...player, channel: 'beta', message: 'raptors', now: 1 });
  advanceWordChainRound(state, 'alpha', WORD_CHAIN_ROUND_MS + WORD_CHAIN_REVIEW_MS);
  const events = getChannelGameSettings(state, 'alpha').pendingWordChainResults!;
  assert.deepEqual([...new Set(events.map(event => event.channel))], ['alpha', 'beta']);
});

test('round and final messages include every player, overall top three and tied winners within chat limits', () => {
  const players = Array.from({ length: 25 }, (_, index) => ({ displayName: `Player${index}`.padEnd(25, 'X'), points: index < 2 ? 100 : 25 - index }));
  const messages = wordChainResultMessages({ channel: 'tenant', roundSlot: 4, theme: 'Dinosaurs', roundParticipants: players,
    gameParticipants: players, gameEnded: true, expiresAt: 99 });
  for (const player of players) assert.ok(messages.some(event => event.message.includes(`${player.displayName} (${player.points} pts)`)));
  assert.ok(messages.every(event => event.message.length <= 420));
  assert.ok(messages.some(event => /FINAL overall top 3/.test(event.message)));
  assert.ok(messages.some(event => /GAME OVER — tied winners:/.test(event.message) && event.message.includes(players[0].displayName) && event.message.includes(players[1].displayName)));
  assert.equal(new Set(messages.map(event => event.id)).size, messages.length);
});
