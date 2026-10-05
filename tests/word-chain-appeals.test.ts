import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceWordChainRound, getChannelGameSettings, getGameHubStore, joinGameHubGame,
  recordWordChainMessage, recordWordChainAppealVote, setStreamGameBattle, wordChainPublicSnapshot,
  WORD_CHAIN_CYCLE_MS, WORD_CHAIN_ROUND_MS, WORD_CHAIN_REVIEW_MS } from '../src/lib/game-hub-state';
import { isSpelledWordChainWord } from '../src/lib/word-chain-spelling';

const player = { channel: 'tenant', userId: '1', username: 'alice', displayName: 'Alice' };
function setup() {
  const state: any = { gameSettings: { default: {} } };
  joinGameHubGame(state, { ...player, gameId: 'wordchain' });
  const round = advanceWordChainRound(state, 'tenant', 0).round;
  round.currentWord = 'FROG';
  round.usedWords = ['FROG'];
  return { state, round };
}
const guess = (state: any, now = 0, message = 'gamers') => recordWordChainMessage(state, { ...player, now, message });
const vote = (state: any, userId: string, yes: boolean, now: number) => recordWordChainAppealVote(state, { channel: 'tenant', userId, yes, now });

test('a dictionary omission opens one 90-second vote and changes no score until an approved retry', () => {
  const { state, round } = setup();
  assert.equal(isSpelledWordChainWord('gamers'), false);
  assert.equal(guess(state).outcome, 'appeal-open');
  assert.equal(round.wordAppeal?.expiresAt, 90_000);
  assert.equal(guess(state, 1).outcome, 'appeal-pending');
  assert.equal(guess(state, 2, 'gamerrr').outcome, 'appeal-pending');
  assert.equal(round.wordAppeal?.word, 'GAMERS');
  vote(state, '2', true, 1000);
  assert.equal(vote(state, '2', true, 2000).outcome, 'unchanged');
  vote(state, '3', false, 3000);
  vote(state, '3', true, 4000);
  assert.equal(guess(state, 89_999).outcome, 'appeal-pending');
  assert.equal(round.currentWord, 'FROG');
  assert.equal(getGameHubStore(state).players['twitch:1'].joinedGames.wordchain.score, 0);
  assert.equal(vote(state, '4', false, 90_000).outcome, 'no-appeal');
  assert.equal(round.wordAppealDecisions?.GAMERS, true);
  assert.equal(guess(state, 90_001).outcome, 'accepted');
  round.currentWord = 'FROG';
  assert.equal(guess(state, 90_002).outcome, 'used');
  assert.equal(getGameHubStore(state).players['twitch:1'].joinedGames.wordchain.score, 6);
  advanceWordChainRound(state, 'tenant', WORD_CHAIN_ROUND_MS + WORD_CHAIN_REVIEW_MS);
  assert.equal(getChannelGameSettings(state, 'tenant').wordChainVerdicts?.[`${round.theme}:GAMERS`], undefined);
});

test('ties, no votes, and no majorities reject without repeated appeals in the same round', () => {
  for (const votes of [[], [true, false], [false], [false, false, true]]) {
    const { state, round } = setup();
    guess(state);
    votes.forEach((yes, index) => vote(state, String(index + 2), yes, 10));
    assert.equal(guess(state, 90_000).outcome, 'appeal-rejected');
    assert.equal(guess(state, 90_001).outcome, 'appeal-rejected');
    assert.equal(round.wordAppeal, undefined);
    assert.equal(round.currentWord, 'FROG');
  }
});

test('approval never bypasses the current chain letter and never becomes a permanent good verdict', () => {
  const { state, round } = setup();
  const settings = getChannelGameSettings(state, 'tenant');
  const key = `${round.theme}:GAMERS`;
  settings.wordChainVerdicts = { [key]: false };
  guess(state);
  vote(state, '2', true, 1);
  round.currentWord = 'RABBIT';
  assert.equal(guess(state, 90_000).outcome, 'wrong-letter');
  round.currentWord = 'FROG';
  assert.equal(guess(state, 90_001).outcome, 'accepted');
  advanceWordChainRound(state, 'tenant', WORD_CHAIN_ROUND_MS + WORD_CHAIN_REVIEW_MS);
  assert.equal(settings.wordChainVerdicts[key], false);
  assert.equal(isSpelledWordChainWord('gamers'), false);
  const next = advanceWordChainRound(state, 'tenant', WORD_CHAIN_CYCLE_MS).round;
  assert.equal(next.wordAppealDecisions, undefined);
  next.currentWord = 'FROG';
  assert.equal(guess(state, WORD_CHAIN_CYCLE_MS).outcome, 'appeal-open');
});

test('linked tenants share votes; unrelated tenants cannot vote on or inherit the exception', () => {
  const { state } = setup();
  setStreamGameBattle(state, { gameId: 'wordchain', channels: ['tenant', 'linked'], createdBy: 'tenant' });
  // Battle state is canonicalized to the first channel alphabetically.
  const round = advanceWordChainRound(state, 'tenant', 0).round;
  round.currentWord = 'FROG';
  guess(state);
  assert.equal(recordWordChainAppealVote(state, { channel: 'unrelated', userId: '2', yes: true, now: 1 }).outcome, 'no-appeal');
  assert.equal(recordWordChainAppealVote(state, { channel: 'linked', userId: '2', yes: true, now: 1 }).outcome, 'voted');
  assert.equal(recordWordChainAppealVote(state, { channel: 'tenant', userId: '2', yes: true, now: 2 }).outcome, 'unchanged');
  advanceWordChainRound(state, 'linked', 90_000);
  assert.equal(guess(state, 90_001).outcome, 'accepted');
  const events = Object.values(getGameHubStore(state).channels).flatMap((settings: any) => settings.pendingWordChainResults || []);
  assert.deepEqual([...new Set(events.filter((event: any) => event.id.endsWith(':closed')).map((event: any) => event.channel))].sort(), ['linked', 'tenant']);
});

test('snapshots do not mutate appeal state, late votes close, and round transitions discard old permissions', () => {
  const { state, round } = setup();
  const late = WORD_CHAIN_ROUND_MS - 1;
  guess(state, late);
  vote(state, '2', true, late + 1);
  const before = JSON.stringify(state);
  assert.equal(wordChainPublicSnapshot(state, 'tenant', late + 90_000).wordAppeal, null);
  assert.equal(JSON.stringify(state), before);
  advanceWordChainRound(state, 'tenant', late + 90_000);
  assert.equal(round.wordAppealDecisions?.GAMERS, true);
  assert.match(getChannelGameSettings(state, 'tenant').pendingWordChainResults!.at(-1)!.message, /Play has ended; no points were added/);
  assert.equal(guess(state, late + 90_000).outcome, 'review');
  assert.equal(advanceWordChainRound(state, 'tenant', WORD_CHAIN_CYCLE_MS).round.wordAppealDecisions, undefined);
  assert.equal(vote(state, '2', true, WORD_CHAIN_CYCLE_MS).outcome, 'no-appeal');
});
