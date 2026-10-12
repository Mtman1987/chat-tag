import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDiscordMosaicTarget } from '../src/lib/discord-mosaic-command';
const state = { discordWebhooks: { 'nebula-game:snow:pixelbattle': { gameId: 'pixelbattle', channel: 'snow', discordChannelId: '123' } } };
test('Discord painting and controls route to card owner', () => {
  for (const message of ['Spmt a8k', 'spmt c3g', 'spmt mosaic', 'spmt brush 2', 'spmt view all', 'spmt reveal']) {
    assert.deepEqual(resolveDiscordMosaicTarget(state, '123', message), { channel: 'snow', ambiguous: false });
  }
});
test('no cross-channel fallback or capture of legacy commands', () => {
  assert.equal(resolveDiscordMosaicTarget(state, '456', 'spmt a8k'), null);
  for (const message of ['spmt pack', 'spmt tag snow', 'spmt score', 'spmt support help']) {
    assert.equal(resolveDiscordMosaicTarget(state, '123', message), null);
  }
});
test('multiple tenants in same Discord channel require explicit choice', () => {
  const both = { discordWebhooks: { ...state.discordWebhooks, 'nebula-game:other:pixelbattle': { gameId: 'pixelbattle', channel: 'other', discordChannelId: '123' } } };
  assert.equal(resolveDiscordMosaicTarget(both, '123', 'spmt a8k')?.ambiguous, true);
});
