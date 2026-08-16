import assert from 'node:assert/strict';
import test from 'node:test';
import { inferPlayerHistory, markPlayerPlayed } from '../src/lib/player-history';

test('played days remain cumulative across multiple events on the same day', () => {
  const player: Record<string, any> = { id: 'user_1', twitchUsername: 'mountaineer' };
  markPlayerPlayed(player, '2026-08-01T01:00:00Z');
  markPlayerPlayed(player, '2026-08-01T23:00:00Z');
  markPlayerPlayed(player, '2026-08-03T12:00:00Z');

  assert.equal(player.joinedAt, '2026-08-01T01:00:00.000Z');
  assert.equal(player.daysPlayed, 2);
  assert.deepEqual(player.playedDays, ['2026-08-01', '2026-08-03']);
});

test('legacy player history is deduced from joins and tag participation', () => {
  const player: Record<string, any> = { id: 'user_42', twitchUsername: 'legacy_player' };
  const state = {
    adminHistory: [{ action: 'join', performedBy: 'legacy_player', details: 'legacy_player joined the game', timestamp: '2026-06-10T10:00:00Z' }],
    tagHistory: [
      { taggerId: 'user_42', taggedId: 'user_2', timestamp: '2026-06-11T10:00:00Z' },
      { taggerId: 'user_3', taggedId: 'user_42', timestamp: '2026-06-13T10:00:00Z' },
    ],
  };

  assert.equal(inferPlayerHistory(state, player), true);
  assert.equal(player.joinedAt, '2026-06-10T10:00:00.000Z');
  assert.equal(player.daysPlayed, 3);
});
