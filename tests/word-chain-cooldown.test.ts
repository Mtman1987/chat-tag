import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceWordChainRound, getChannelGameSettings, getGameHubStore, joinGameHubGame,
  recordWordChainMessage, recordWordChainAppealVote, setStreamGameBattle, WORD_CHAIN_CYCLE_MS } from '../src/lib/game-hub-state';

const alice = { userId: '1', username: 'alice', displayName: 'Alice' };
const bob = { userId: '2', username: 'bob', displayName: 'Bob' };
function setup() {
  const state: any = { gameSettings: { default: {} } };
  for (const player of [alice, bob]) joinGameHubGame(state, { ...player, gameId: 'wordchain' });
  return state;
}
function play(state: any, player: typeof alice, word: string, now: number, channel = 'tenant') {
  return recordWordChainMessage(state, { ...player, message: word, channel, now });
}

test('a consecutive answer waits exactly 30 seconds and blocked attempts change neither score nor timer', () => {
  const state = setup();
  assert.equal(play(state, alice, 'raccoon', 0).outcome, 'accepted');
  const before = JSON.stringify(state);
  const early = play(state, alice, 'newt', 1);
  assert.equal(early.outcome, 'cooldown');
  assert.equal('secondsLeft' in early && early.secondsLeft, 30);
  assert.equal(JSON.stringify(state), before);
  const last = play(state, alice, 'newt', 29_999);
  assert.equal('secondsLeft' in last && last.secondsLeft, 1);
  assert.equal(play(state, alice, 'newt', 30_000).outcome, 'accepted');
  assert.equal(getChannelGameSettings(state, 'tenant').wordChainRound?.lastContributionAt, 30_000);
  assert.equal(getGameHubStore(state).players['twitch:1'].joinedGames.wordchain.score, 13);
  assert.equal(play(state, alice, 'truck', 30_001).outcome, 'cooldown');
});

test('another accepted answer immediately releases the previous player, allowing alternating play', () => {
  const state = setup();
  for (const [player, word, now] of [[alice, 'raccoon', 0], [bob, 'newt', 1], [alice, 'truck', 2], [bob, 'kangaroo', 3]] as const) {
    assert.equal(play(state, player, word, now).outcome, 'accepted');
  }
});

test('another player’s rejected word or vote does not release the cooldown', () => {
  const state = setup();
  play(state, alice, 'raccoon', 0);
  assert.equal(play(state, bob, 'tiger', 1).outcome, 'wrong-letter');
  assert.equal(play(state, bob, 'nectr', 2).outcome, 'appeal-open');
  assert.equal(recordWordChainAppealVote(state, { ...bob, channel: 'tenant', yes: true, now: 3 }).outcome, 'voted');
  assert.equal(play(state, alice, 'newt', 4).outcome, 'cooldown');
  assert.equal(play(state, bob, 'nectar', 5).outcome, 'accepted');
  assert.equal(play(state, alice, 'rabbit', 6).outcome, 'accepted');
});

test('cooldown survives reloads and spans linked channels, but resets for a new round', () => {
  let state = setup();
  setStreamGameBattle(state, { gameId: 'wordchain', channels: ['alpha', 'beta'], createdBy: 'alpha' });
  play(state, alice, 'raccoon', 0, 'alpha');
  state = JSON.parse(JSON.stringify(state));
  assert.equal(play(state, alice, 'newt', 1, 'beta').outcome, 'cooldown');
  assert.equal(play(state, bob, 'newt', 2, 'beta').outcome, 'accepted');
  assert.equal(play(state, alice, 'truck', 3, 'alpha').outcome, 'accepted');
  assert.equal(play(state, alice, 'raccoon', 4, 'unrelated').outcome, 'accepted');
  const next = advanceWordChainRound(state, 'alpha', WORD_CHAIN_CYCLE_MS).round;
  assert.equal(next.lastContributionAt, undefined);
  next.currentWord = 'TIGER';
  assert.equal(play(state, alice, 'raccoon', WORD_CHAIN_CYCLE_MS, 'beta').outcome, 'accepted');
});
