import assert from 'node:assert/strict';
import test from 'node:test';
import {
  openQuackverseBoosterPack,
  QUACKVERSE_PACK_SIZE,
} from '../src/lib/quackverse-packs';

test('Quackverse boosters use the nine-card pack contract', () => {
  const pack = openQuackverseBoosterPack();
  assert.equal(QUACKVERSE_PACK_SIZE, 9);
  assert.equal(pack.length, QUACKVERSE_PACK_SIZE);
  assert.equal(new Set(pack.map((card) => card.id)).size, QUACKVERSE_PACK_SIZE);
});
