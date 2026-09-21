import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  claimNextMosaicRequest,
  failMosaicRequest,
  MOSAIC_XP_COST,
  installMosaicTemplate,
  mosaicPublicSnapshot,
  observeMosaicActiveTime,
  paintMosaicCell,
  parseMosaicPaintCommand,
  parseMosaicViewCommand,
  queueMosaicTheme,
  setMosaicView,
} from '../src/lib/nebula-mosaic';

test('Mosaic theme requests are free by default during testing', () => {
  assert.equal(MOSAIC_XP_COST, 0);
});

test('Mosaic requests a low-cost square source through the authenticated StreamWeaver bridge', () => {
  const source = fs.readFileSync('src/lib/nebula-mosaic-generation.ts', 'utf8');
  assert.match(source, /resolution: '1024x1024'/);
  assert.doesNotMatch(source, /resolution: '1024x1536'/);
  assert.match(source, /Authorization: `Bearer \$\{serviceSecret\}`/);
});

test('Mosaic retries failed generation instead of silently dropping the theme', () => {
  const draft = state();
  queueMosaicTheme(draft, {
    channel: 'spacemountainlive', userId: '42', username: 'viewer', displayName: 'Viewer', theme: 'kitten', now: 1,
  });
  const first = claimNextMosaicRequest(draft, 'spacemountainlive', 2)!;
  assert.equal(first.attempts, 1);
  failMosaicRequest(draft, 'spacemountainlive', first.id, 'provider unavailable', 3);
  const waiting = mosaicPublicSnapshot(draft, 'spacemountainlive', 4);
  assert.equal(waiting.queueLength, 1);
  assert.equal(waiting.generation?.theme, 'kitten');
  assert.equal(waiting.generation?.status, 'failed');
  assert.equal(claimNextMosaicRequest(draft, 'spacemountainlive', 9_999), null);
  assert.equal(claimNextMosaicRequest(draft, 'spacemountainlive', 10_003)?.attempts, 2);
});

test('Mosaic revives the already-requested artwork after the legacy unsupported size failure', () => {
  const draft = state();
  queueMosaicTheme(draft, {
    channel: 'spacemountainlive', userId: '42', username: 'viewer', displayName: 'Viewer', theme: 'kitten', now: 1,
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const at = 2 + attempt * 10_001;
    const request = claimNextMosaicRequest(draft, 'spacemountainlive', at)!;
    failMosaicRequest(draft, 'spacemountainlive', request.id, 'SeaArt rejects resolution 1024x1536', at + 1);
  }
  assert.equal(mosaicPublicSnapshot(draft, 'spacemountainlive', 30_100).queueLength, 1);
  const recovered = claimNextMosaicRequest(draft, 'spacemountainlive', 30_101)!;
  assert.equal(recovered.theme, 'kitten');
  assert.equal(recovered.attempts, 1);
  assert.equal(recovered.recoveryVersion, 1);
});

function state() {
  return { gameSettings: { default: {} } } as any;
}

function readyMosaic() {
  const draft = state();
  const queued = queueMosaicTheme(draft, {
    channel: 'SpaceMountainLive', userId: '42', username: 'viewer', displayName: 'Viewer', theme: 'owl', xpCost: 500, now: 1,
  });
  installMosaicTemplate(draft, 'spacemountainlive', queued.request.id, Array.from({ length: 2_000 }, () => 'Y'), {}, 2);
  return draft;
}

test('Mosaic accepts compact, spaced, named and reversed paint commands', () => {
  const expected = { coordinate: 'D12', column: 3, row: 11, color: 'Y' };
  assert.deepEqual(parseMosaicPaintCommand('spmt d12y'), expected);
  assert.deepEqual(parseMosaicPaintCommand('spmt d12 y'), expected);
  assert.deepEqual(parseMosaicPaintCommand('spmt d12 yellow'), expected);
  assert.deepEqual(parseMosaicPaintCommand('spmt yellow d12'), expected);
  assert.deepEqual(parseMosaicPaintCommand('SPMT D 12 YELLOW'), expected);
});

test('Mosaic show and view commands select one board or the temporary combined artwork', () => {
  assert.equal(parseMosaicViewCommand('spmt view 3'), 3);
  assert.equal(parseMosaicViewCommand('spmt view all'), 'all');
  assert.equal(parseMosaicViewCommand('spmt show 3'), 3);
  assert.equal(parseMosaicViewCommand('spmt show all'), 'all');
  assert.equal(parseMosaicViewCommand('spmt mosaic show 2'), 2);
  const draft = readyMosaic();
  setMosaicView(draft, 'spacemountainlive', 4, 10);
  assert.equal(mosaicPublicSnapshot(draft, 'spacemountainlive', 11).artwork?.activeBoard, 4);
  setMosaicView(draft, 'spacemountainlive', 'all', 20);
  assert.equal(mosaicPublicSnapshot(draft, 'spacemountainlive', 21).artwork?.viewMode, 'all');
  assert.equal(mosaicPublicSnapshot(draft, 'spacemountainlive', 20_000).artwork?.viewMode, 'board');
});

test('Mosaic scores correct and incorrect colors and persists exact board progress', () => {
  const draft = readyMosaic();
  const wrong = paintMosaicCell(draft, {
    channel: 'spacemountainlive', userId: '7', username: 'artist', displayName: 'Artist',
    command: parseMosaicPaintCommand('spmt d12 red')!, now: 100,
  });
  assert.equal(wrong.outcome, 'wrong');
  assert.equal(wrong.score, 0);
  const correct = paintMosaicCell(draft, {
    channel: 'spacemountainlive', userId: '7', username: 'artist', displayName: 'Artist',
    command: parseMosaicPaintCommand('spmt yellow d12')!, now: 101,
  });
  assert.equal(correct.outcome, 'painted');
  assert.equal(correct.score, 1);
  const snapshot = mosaicPublicSnapshot(draft, 'spacemountainlive', 102);
  assert.equal(snapshot.artwork?.painted[11 * 20 + 3], 'Y');
});

test('Mosaic inactivity saves and suspends without losing cells', () => {
  const draft = readyMosaic();
  paintMosaicCell(draft, {
    channel: 'spacemountainlive', userId: '7', username: 'artist', displayName: 'Artist',
    command: parseMosaicPaintCommand('spmt d12y')!, now: 1_000,
  });
  for (let step = 1; step <= 60; step += 1) {
    observeMosaicActiveTime(draft, 'spacemountainlive', 1_000 + step * 30_000);
  }
  const snapshot = mosaicPublicSnapshot(draft, 'spacemountainlive', 2_000_000);
  assert.equal(snapshot.artwork?.status, 'suspended');
  assert.equal(snapshot.artwork?.painted[11 * 20 + 3], 'Y');
});
