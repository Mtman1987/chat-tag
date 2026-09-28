import assert from 'node:assert/strict';
import test from 'node:test';
import { getGameHubGameStats } from '../src/lib/game-hub-state';

test('Chat Tag per-game leaderboard reads the live tag roster and history', () => {
  const state: any = {
    tagPlayers: {
      user_1: { id: 'user_1', twitchUsername: 'one', joinedAt: '2026-09-01T00:00:00.000Z' },
      user_2: { id: 'user_2', twitchUsername: 'two', joinedAt: '2026-09-01T00:00:00.000Z' },
    },
    tagHistory: [
      { taggerId: 'user_1', taggedId: 'user_2' },
      { taggerId: 'user_1', taggedId: 'user_2', blocked: true },
    ],
    gameSettings: { default: { tagSuccessPoints: 100, tagPenaltyPoints: 50 } },
  };
  const stats = getGameHubGameStats(state, 'chat-tag');
  assert.deepEqual(stats.leaderboard.map((player) => [player.username, player.score]), [
    ['one', 100],
    ['two', -50],
  ]);
  assert.equal(stats.players.length, 2);
});
