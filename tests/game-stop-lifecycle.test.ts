import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_INACTIVITY_MS, getChannelGameSettings, resolveChannelGameIds, setChannelGameRunning, stopInactiveChannelGames } from '../src/lib/game-hub-state';
import { recordGameHubRuntimeAction } from '../src/lib/game-hub-runtime';
import { getTreasureHuntState, joinTreasureRotation, settleTreasureTurn } from '../src/lib/treasure-hunt';

const state = () => ({ gameSettings: { default: {} } } as any);

test('stop ends treasure turns and challenge and preserves another channel', () => {
  const draft = state();
  for (const channel of ['space', 'other']) {
    setChannelGameRunning(draft, channel, 'treasurehunt', true);
    joinTreasureRotation(draft, { channel, username: 'captain', now: Date.now() });
  }
  const game = getTreasureHuntState(draft, 'space');
  setChannelGameRunning(draft, 'space', 'treasurehunt', false);
  assert.deepEqual(game.rotation, []);
  assert.equal(game.turnExpiresAt, undefined);
  assert.equal(settleTreasureTurn(draft, 'space', Date.now() + 180000).changed, false);
  assert.deepEqual(resolveChannelGameIds(draft, 'space'), []);
  assert.deepEqual(resolveChannelGameIds(draft, 'other'), ['treasurehunt']);
  assert.equal(getTreasureHuntState(draft, 'other').rotation.length, 1);
});

test('mosaic stop saves artwork and explicit restart creates a fresh inactivity window', () => {
  const draft = state();
  setChannelGameRunning(draft, 'space', 'pixelbattle', true);
  const settings = getChannelGameSettings(draft, 'space') as any;
  settings.mosaic = { current: { id: 'art', status: 'active', painted: ['R'] }, saves: [] };
  setChannelGameRunning(draft, 'space', 'pixelbattle', false);
  assert.equal(settings.mosaic.current.status, 'suspended');
  assert.deepEqual(settings.mosaic.saves[0].painted, ['R']);
  setChannelGameRunning(draft, 'space', 'pixelbattle', true);
  assert.deepEqual(stopInactiveChannelGames(draft, 'space'), []);
});

test('community games stay available after a day of inactivity by default', () => {
  const draft = state(), now = Date.now();
  const games = ['wordchain','treasurehunt','pixelbattle','chatwars','bingo','emojirain'];
  for (const id of games) setChannelGameRunning(draft, 'space', id, true);
  assert.deepEqual(stopInactiveChannelGames(draft, 'space', now + 24 * 60 * 60_000), []);
  assert.deepEqual(resolveChannelGameIds(draft, 'space').sort(), games.sort());
});
