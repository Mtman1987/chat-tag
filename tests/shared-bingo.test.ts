import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BINGO_CENTER_FREE_COST,
  BINGO_PHRASE_CHANGE_COST,
  BINGO_STELLA_FLIP_COST,
  buyBingoCenterFree,
  buyBingoStellaFlip,
  ingestBingoTranscript,
  settleExpiredBingoClaims,
  sharedBingoPublicSnapshot,
  suggestSharedBingoPhrase,
} from '../src/lib/shared-bingo';
import { joinGameHubGame } from '../src/lib/game-hub-state';

const player = { channel: 'space', userId: '1', username: 'player', displayName: 'Player' };
function state() { return { gameSettings: { default: {} } } as any; }
function fund(draft: any, amount = 2_000) {
  const joined = joinGameHubGame(draft, { ...player, gameId: 'bingo' });
  joined.player.gamePointsBalance = amount;
  return joined.player;
}

test('broadcast Bingo hides phrases while the signed-in player view can include them', () => {
  const draft = state();
  assert.equal(sharedBingoPublicSnapshot(draft, 'space').cells[0].phrase, undefined);
  assert.equal(sharedBingoPublicSnapshot(draft, 'space', { includePhrases: true }).cells[0].phrase, 'hello chat');
});

test('transcripts open a claim window and Stella takes unclaimed squares', () => {
  const draft = state();
  const trigger = ingestBingoTranscript(draft, { channel: 'space', text: 'Well hello chat, welcome in!', now: 1 });
  assert.ok(trigger.triggered.includes('A1'));
  assert.equal(sharedBingoPublicSnapshot(draft, 'space', { now: 2 }).cells[0].status, 'pending');
  const settled = settleExpiredBingoClaims(draft, 'space', 20_000);
  assert.ok(settled.blocked.includes('A1'));
  assert.equal(sharedBingoPublicSnapshot(draft, 'space', { now: 20_000 }).cells[0].status, 'stella');
});

test('Bingo spending ladder changes phrases, flips Stella, and buys center for chat', () => {
  const draft = state();
  fund(draft);
  ingestBingoTranscript(draft, { channel: 'space', text: 'hello chat', now: 1 });
  settleExpiredBingoClaims(draft, 'space', 20_000);

  const changed = suggestSharedBingoPhrase(draft, { ...player, coordinate: 'A1', phrase: 'space mountain', now: 20_001 });
  assert.equal(changed.cost, BINGO_PHRASE_CHANGE_COST);
  assert.equal(draft.gameSettings.default.gameHub.players['twitch:1'].gamePointsBalance, 2_000 - BINGO_PHRASE_CHANGE_COST);

  ingestBingoTranscript(draft, { channel: 'space', text: 'space mountain', now: 21_000 });
  settleExpiredBingoClaims(draft, 'space', 40_000);
  const flipped = buyBingoStellaFlip(draft, { ...player, coordinate: 'A1', now: 40_001 });
  assert.equal(flipped.cost, BINGO_STELLA_FLIP_COST);
  assert.equal(sharedBingoPublicSnapshot(draft, 'space', { now: 40_001 }).cells[0].status, 'chat');

  const freed = buyBingoCenterFree(draft, { ...player, now: 40_002 });
  assert.equal(freed.cost, BINGO_CENTER_FREE_COST);
  assert.equal(sharedBingoPublicSnapshot(draft, 'space', { now: 40_002 }).cells[12].status, 'chat');
});
