import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chatWarsMinimumWordLength,
  chatWarsPublicSnapshot,
  getChatWarsState,
  recordChatWarsMessage,
  setChatWarsTeam,
} from '../src/lib/chat-wars';

function state() {
  return { gameSettings: { default: {} } } as any;
}

const red = { channel: 'space', userId: '1', username: 'redplayer', displayName: 'Red Player' };

test('Chat Wars locks a player to one team for the campaign', () => {
  const draft = state();
  assert.equal(setChatWarsTeam(draft, { ...red, team: 'red', now: 1 }).locked, false);
  const switchAttempt = setChatWarsTeam(draft, { ...red, team: 'blue', now: 2 });
  assert.equal(switchAttempt.locked, true);
  assert.equal(switchAttempt.team, 'red');
});

test('Chat Wars scores useful words once, caps each message, and paints neutral territory', () => {
  const draft = state();
  setChatWarsTeam(draft, { ...red, team: 'red', now: 1 });
  const result = recordChatWarsMessage(draft, {
    ...red,
    message: 'cat mountain universe nebula community excellent additional words ignored',
    now: 2,
    random: () => 0,
  });
  assert.equal(result.outcome, 'scored');
  assert.equal(result.qualifyingWords?.length, 5);
  assert.equal(result.claimed, 1);
  assert.ok((result.points || 0) > 5);
  assert.equal(draft.gameSettings.default.gameHub.players['twitch:1'].gamePointsBalance, result.points);
  assert.equal(recordChatWarsMessage(draft, {
    ...red,
    message: 'cat mountain universe nebula community excellent additional words ignored',
    now: 3,
  }).outcome, 'duplicate');
  assert.equal(chatWarsPublicSnapshot(draft, 'space').counts.red, 1);
});

test('Chat Wars raises difficulty and gives level-six players a chance to steal from the leader', () => {
  const draft = state();
  setChatWarsTeam(draft, { ...red, team: 'red', now: 1 });
  const game = getChatWarsState(draft, 'space', 1);
  game.halves[0][0] = 'blue';
  const warPlayer = game.players['twitch:1'];
  warPlayer.eligibleMessages = 149;
  warPlayer.level = 5;
  const result = recordChatWarsMessage(draft, {
    ...red,
    message: 'valuable conversation reaches the next level',
    now: 200,
    random: () => 0,
  });
  assert.equal(result.level, 6);
  assert.equal(chatWarsMinimumWordLength(result.level || 1), 5);
  assert.equal(result.stolen, 1);
  assert.equal(result.claimed, 5);
  assert.equal(chatWarsPublicSnapshot(draft, 'space').tiles[0], 'red');
});

test('Chat Wars saves the first 20x25 field, pauses once for Stella, then opens the second half', () => {
  const draft = state();
  setChatWarsTeam(draft, { ...red, team: 'red', now: 1 });
  const game = getChatWarsState(draft, 'space', 1);
  game.halves[0].fill('blue');
  game.halves[0][499] = 'gray';
  const halftime = recordChatWarsMessage(draft, {
    ...red,
    message: 'halftime territory complete',
    now: 2,
    random: () => 0,
  });
  assert.equal(halftime.outcome, 'halftime-started');
  assert.equal(halftime.halftime?.counts.red, 1);
  assert.equal(chatWarsPublicSnapshot(draft, 'space', 3).phase, 'halftime');

  const secondHalf = recordChatWarsMessage(draft, {
    ...red,
    message: 'second battlefield begins',
    now: 60_003,
    random: () => 0,
  });
  assert.equal(secondHalf.outcome, 'scored');
  assert.equal(secondHalf.activeHalf, 2);
  const snapshot = chatWarsPublicSnapshot(draft, 'space', 60_004);
  assert.equal(snapshot.combined.width, 40);
  assert.equal(snapshot.combined.height, 25);
  assert.equal(snapshot.combined.tiles.length, 1000);
});
