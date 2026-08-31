import assert from 'node:assert/strict';
import test from 'node:test';

import { quackverseCards } from '../src/lib/quackverse-data';
import { QUACKVERSE_CANON_GROUPS } from '../src/lib/quackverse-canon-groups';
import { getQuackverseVisualCanon } from '../src/lib/quackverse-visual-canon';

test('every Quackverse card has a layered canon group and the deck stays above 100 cards', () => {
  assert.ok(quackverseCards.length >= 100);
  assert.equal(Object.keys(QUACKVERSE_CANON_GROUPS).length, quackverseCards.length);
  for (const card of quackverseCards) assert.ok(QUACKVERSE_CANON_GROUPS[card.id], `missing canon group for card ${card.id}`);
});

test('Lunar cards use Lunar affinity instead of Frost', () => {
  for (const cardId of [7, 27, 47, 67, 88, 101]) {
    assert.equal(QUACKVERSE_CANON_GROUPS[cardId].affinity, 'Lunar');
  }
});

test('Moonbeam is locked feminine and Lunar', () => {
  const card = quackverseCards.find((entry) => entry.id === 7)!;
  const canon = getQuackverseVisualCanon(card);
  assert.equal(canon.presentation, 'feminine');
  assert.equal(canon.affinity, 'Lunar');
  assert.match(canon.vfx, /visible moon/i);
});

test('Prime and Ultra evolutions inherit the base identity species', () => {
  const chains = [
    [31, 49, 69],
    [25, 53, 73],
    [39, 75],
    [24, 76],
    [46, 66],
    [43, 63, 79],
    [51, 71],
    [41, 77],
    [36, 52, 72],
    [44, 64, 80],
  ];
  for (const chain of chains) {
    const base = getQuackverseVisualCanon(quackverseCards.find((entry) => entry.id === chain[0])!);
    for (const cardId of chain.slice(1)) {
      const evolved = getQuackverseVisualCanon(quackverseCards.find((entry) => entry.id === cardId)!);
      assert.equal(evolved.species, base.species, `card ${cardId} should inherit species from ${chain[0]}`);
      assert.equal(evolved.identityBaseId, chain[0]);
    }
  }
});

test('Starforge Mallard is canonically a Mallard and Navigator is a real visual class', () => {
  const starforge = getQuackverseVisualCanon(quackverseCards.find((entry) => entry.id === 65)!);
  const navigator = getQuackverseVisualCanon(quackverseCards.find((entry) => entry.id === 11)!);
  assert.equal(starforge.species, 'Mallard');
  assert.equal(navigator.className, 'Navigator');
});
