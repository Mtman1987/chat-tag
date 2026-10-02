import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('overlay polls bypass a busy write queue and expired turns still settle durably', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'game-read-pressure-'));
  process.env.DATA_DIR = dir;
  const store = await import('../src/lib/volume-store');
  const games = await import('../src/lib/game-hub-state');
  const treasure = await import('../src/lib/treasure-hunt');
  const bingo = await import('../src/lib/shared-bingo');
  const treasureRoute = await import('../src/app/api/game-hub/treasure-hunt/route');
  const bingoRoute = await import('../src/app/api/game-hub/shared-bingo/route');
  const { NextRequest } = await import('next/server');
  try {
    await store.updateAppState(state => {
      games.setChannelGameRunning(state, 'space', 'treasurehunt', true);
      games.setChannelGameRunning(state, 'space', 'bingo', true);
      treasure.joinTreasureRotation(state, { channel: 'space', username: 'captain' });
      bingo.getSharedBingoState(state, 'space');
    });
    let entered!: () => void, release!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const writer = store.updateAppState(async () => { entered(); await barrier; });
    await enteredPromise;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    try {
      const polls = Promise.all([
        treasureRoute.GET(new NextRequest('http://localhost/api/game-hub/treasure-hunt?channel=space')),
        bingoRoute.GET(new NextRequest('http://localhost/api/game-hub/shared-bingo?channel=space')),
      ]);
      const responses = await Promise.race([polls, new Promise<never>((_, reject) => {
        watchdog = setTimeout(() => reject(new Error('Read-only polling waited for the write lock')), 1000);
      })]);
      assert.equal(responses[0].status, 200);
      assert.equal(responses[1].status, 200);
      assert.equal((await responses[0].json()).turn.current.username, 'captain');
      assert.equal(store.getVolumeStoreDiagnostics().queuedUpdates, 1);
    } finally { clearTimeout(watchdog); release(); await writer; }
    await store.updateAppState(state => {
      treasure.getTreasureHuntState(state, 'space').turnExpiresAt = new Date(Date.now() - 1).toISOString();
      const square = bingo.getSharedBingoState(state, 'space').squares[0];
      square.status = 'pending'; square.claimUntil = new Date(Date.now() - 1).toISOString();
    });
    await treasureRoute.GET(new NextRequest('http://localhost/api/game-hub/treasure-hunt?channel=space'));
    await bingoRoute.GET(new NextRequest('http://localhost/api/game-hub/shared-bingo?channel=space'));
    const persisted = JSON.parse(await readFile(path.join(dir, 'app-state.gameSettings.json'), 'utf8'));
    assert.equal(persisted.default.gameHub.channels.space.treasureHunt.rotation[0].skips, 1);
    assert.equal(persisted.default.gameHub.channels.space.sharedBingo.squares[0].status, 'stella');
    const core = JSON.parse(await readFile(path.join(dir, 'app-state.json'), 'utf8'));
    assert.equal(core.gameSettings, undefined);
    assert.ok(core.users);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
