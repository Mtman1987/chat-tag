import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findLegacyTwitchUserRecord,
  resolveChatTagAppUserId,
} from '../src/lib/quackverse-identity';

test('matching signed Twitch identity preserves the historical collection key', () => {
  assert.equal(
    resolveChatTagAppUserId(
      { id: 'd696355b-e13a-408b-b21a-bcfa8dec15e0', twitchUsername: 'Mtman1987' },
      { id: '94371378', twitchUsername: 'mtman1987', avatarUrl: '' },
    ),
    '94371378',
  );
});

test('mismatched Twitch names cannot swap another users collection', () => {
  assert.equal(
    resolveChatTagAppUserId(
      { id: 'spmt-user-a', twitchUsername: 'mtman1987' },
      { id: '434887372', twitchUsername: 'tigerflakes420', avatarUrl: '' },
    ),
    'spmt-user-a',
  );
});

test('only numeric historical Twitch IDs can override app data identity', () => {
  assert.equal(
    resolveChatTagAppUserId(
      { id: 'spmt-user-a', twitchUsername: 'mtman1987' },
      { id: 'another-spmt-uuid', twitchUsername: 'mtman1987', avatarUrl: '' },
    ),
    'spmt-user-a',
  );
});

test('legacy Twitch records are recovered case-insensitively from persisted users', () => {
  assert.deepEqual(
    findLegacyTwitchUserRecord({
      '94371378': { id: '94371378', twitchUsername: 'MtMan1987', avatarUrl: 'avatar' },
      abc: { id: 'abc', twitchUsername: 'mtman1987' },
    }, 'mtman1987'),
    { id: '94371378', twitchUsername: 'MtMan1987', avatarUrl: 'avatar' },
  );
});
