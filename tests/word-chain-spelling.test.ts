import assert from 'node:assert/strict';
import test from 'node:test';
import { isSpelledWordChainWord } from '../src/lib/word-chain-spelling';
import { advanceWordChainRound, getChannelGameSettings, getGameHubStore, joinGameHubGame,
  recordWordChainMessage, recordWordChainVote, submitWordChainTheme, WORD_CHAIN_ROUND_MS } from '../src/lib/game-hub-state';

const identity = { channel: 'tenant', userId: '1', username: 'alice', displayName: 'Alice', now: 0 };
function setup(currentWord: string) {
  const state: any = { gameSettings: { default: {} } };
  joinGameHubGame(state, { ...identity, gameId: 'wordchain' });
  const round = advanceWordChainRound(state, identity.channel, 0).round;
  round.currentWord = currentWord;
  round.usedWords = [currentWord];
  return { state, round };
}

test('bundled dictionary rejects misspellings and joined phrases, with real compounds and inflections accepted', () => {
  for (const word of ['nectr', 'frenchhorn', 'icecream', 'bluewhale', 'xyzzyplugh', 'nectarrr']) assert.equal(isSpelledWordChainWord(word), false, word);
  for (const word of ['nectar', 'NECTAR', 'football', 'footballers', 'sunflower', 'raccoons', 'running', 'studies', 'colour', 'color', 'colours', 'colors']) assert.equal(isSpelledWordChainWord(word), true, word);
});

test('a rejected spelling cannot advance the chain, award points, or become a used word', () => {
  const { state, round } = setup('RAIN');
  const before = structuredClone(state);
  assert.equal(recordWordChainMessage(state, { ...identity, message: 'nectr' }).outcome, 'spelling');
  assert.equal(JSON.stringify(state), JSON.stringify(before));
  assert.equal(recordWordChainMessage(state, { ...identity, message: 'nectar' }).outcome, 'accepted');
  assert.equal(round.currentWord, 'NECTAR');
  assert.equal(getGameHubStore(state).players['twitch:1'].joinedGames.wordchain.score, 6);
});

test('joined phrases fail but a legitimate single-word compound plays normally', () => {
  const { state, round } = setup('LEAF');
  assert.equal(recordWordChainMessage(state, { ...identity, message: 'frenchhorn' }).outcome, 'spelling');
  assert.equal(recordWordChainMessage(state, { ...identity, message: 'french horn' }).outcome, 'invalid');
  assert.equal(round.currentWord, 'LEAF');
  assert.equal(recordWordChainMessage(state, { ...identity, message: 'football' }).outcome, 'accepted');
});

test('theme suitability stays with voters, and trusted game names remain playable', () => {
  const { state, round } = setup('RAIN');
  assert.equal(round.theme, 'Animals');
  assert.equal(recordWordChainMessage(state, { ...identity, message: 'nectar' }).outcome, 'accepted');
  assert.equal(recordWordChainVote(state, { ...identity, word: 'nectar', up: false, now: WORD_CHAIN_ROUND_MS }).outcome, 'voted');
  const game = setup('TOY');
  assert.equal(recordWordChainMessage(game.state, { ...identity, message: 'Yoshi' }).outcome, 'accepted');
});

test('custom theme seeds cannot bypass spelling; old invalid seeds are filtered', () => {
  const { state, round } = setup('RAIN');
  assert.throws(() => submitWordChainTheme(state, { ...identity, name: 'Instruments', words: 'frenchhorn, piano, guitar, flute' }), /Check these starter words: FRENCHHORN/);
  round.themeWords = ['NECTR'];
  assert.equal(recordWordChainMessage(state, { ...identity, message: 'nectr' }).outcome, 'spelling');
  const settings = getChannelGameSettings(state, 'legacy');
  settings.wordChainThemeInventory = [{ id: 'old', name: 'Old theme', normalized: 'old theme', words: ['NECTR'], submitterPlayerId: '1', submitterDisplayName: 'Alice', submittedAt: new Date(0).toISOString() }];
  settings.wordChainThemeQueue = ['old theme'];
  assert.equal(advanceWordChainRound(state, 'legacy', 0).round.currentWord, '');
});
