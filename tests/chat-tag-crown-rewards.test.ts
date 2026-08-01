import test from 'node:test';
import assert from 'node:assert/strict';
import { crownUpstreamEventId, crownXpReward } from '../src/lib/chat-tag-crown-rewards';

test('crowns pay a fixed SPMT purse per place', () => {
  assert.equal(crownXpReward(1), 500);
  assert.equal(crownXpReward(2), 250);
  assert.equal(crownXpReward(3), 100);
  assert.equal(crownXpReward(4), 0);
});

test('the payout is keyed per winner, place and month so re-setting a winner never double-pays', () => {
  const first = crownUpstreamEventId({ userId: 'user_123', place: 1, month: 'August 2026' });
  assert.equal(first, 'crown:august-2026:1:user_123');
  assert.equal(first, crownUpstreamEventId({ userId: 'user_123', place: 1, month: 'August 2026' }));
  assert.notEqual(first, crownUpstreamEventId({ userId: 'user_123', place: 1, month: 'September 2026' }));
  assert.notEqual(first, crownUpstreamEventId({ userId: 'user_123', place: 2, month: 'August 2026' }));
});
