import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PASS_SPEND_LIMIT,
  PASS_SPEND_WINDOW_MS,
  getPassSpendDenial,
} from '../src/lib/pass-policy.ts';

test('allows three pass uses inside a rolling 24-hour window', () => {
  const now = Date.UTC(2026, 6, 27, 12);
  const history = Array.from({ length: PASS_SPEND_LIMIT - 1 }, (_, index) => ({
    taggerId: 'user_1',
    timestamp: now - (index + 1) * 60_000,
    passUsed: true,
  }));

  assert.equal(getPassSpendDenial(history, 'user_1', now), null);
});

test('blocks the fourth pass use until the oldest recent use expires', () => {
  const now = Date.UTC(2026, 6, 27, 12);
  const history = [
    { taggerId: 'user_1', timestamp: now - PASS_SPEND_WINDOW_MS + 1, passUsed: true },
    { taggerId: 'user_1', timestamp: now - 2 * 60 * 60 * 1000, passUsed: true },
    { taggerId: 'user_1', timestamp: now - 60 * 60 * 1000, passUsed: true },
  ];

  assert.deepEqual(getPassSpendDenial(history, 'user_1', now), {
    reason: 'spend-limit',
    hoursLeft: 1,
    used: 3,
  });
});

test('ignores expired, other-player, and non-pass history entries', () => {
  const now = Date.UTC(2026, 6, 27, 12);
  const history = [
    { taggerId: 'user_1', timestamp: now - PASS_SPEND_WINDOW_MS, passUsed: true },
    { taggerId: 'user_2', timestamp: now - 1_000, passUsed: true },
    { taggerId: 'user_1', timestamp: now - 1_000, passUsed: false },
  ];

  assert.equal(getPassSpendDenial(history, 'user_1', now), null);
});
