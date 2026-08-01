import test from 'node:test';
import assert from 'node:assert/strict';
import { crownMonthKey, crownUpstreamEventId, crownXpReward } from '../src/lib/chat-tag-crown-rewards';

test('crowns pay a fixed SPMT purse per place', () => {
  assert.equal(crownXpReward(1), 500);
  assert.equal(crownXpReward(2), 250);
  assert.equal(crownXpReward(3), 100);
  assert.equal(crownXpReward(4), 0);
});

test('the month key is UTC-derived so locale or region changes cannot re-key a paid crown', () => {
  assert.equal(crownMonthKey(new Date('2026-08-01T00:30:00Z')), '2026-08');
  assert.equal(crownMonthKey(new Date('2026-12-31T23:59:59Z')), '2026-12');
});

test('the payout is keyed per winner, place and month so re-setting a winner never double-pays', () => {
  const first = crownUpstreamEventId({ userId: 'user_123', place: 1, monthKey: '2026-08' });
  assert.equal(first, 'crown:2026-08:1:user_123');
  assert.equal(first, crownUpstreamEventId({ userId: 'user_123', place: 1, monthKey: '2026-08' }));
  assert.notEqual(first, crownUpstreamEventId({ userId: 'user_123', place: 1, monthKey: '2026-09' }));
  assert.notEqual(first, crownUpstreamEventId({ userId: 'user_123', place: 2, monthKey: '2026-08' }));
});
