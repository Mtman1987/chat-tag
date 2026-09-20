import assert from 'node:assert/strict';
import test from 'node:test';
import {
  installMosaicTemplate,
  mosaicPublicSnapshot,
  observeMosaicActiveTime,
  paintMosaicCell,
  parseMosaicPaintCommand,
  parseMosaicViewCommand,
  queueMosaicTheme,
  setMosaicView,
} from '../src/lib/nebula-mosaic';

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

test('Mosaic view commands select one board or the temporary combined artwork', () => {
  assert.equal(parseMosaicViewCommand('spmt view 3'), 3);
  assert.equal(parseMosaicViewCommand('spmt view all'), 'all');
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
