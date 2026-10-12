import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMosaicReplyService, MOSAIC_REPLY_WINDOW_MS, adoptLegacyMosaicReplies } from '../src/lib/mosaic-discord-replies';

function harness() {
  let now = 1000;
  const state: any = { discordWebhooks: {} };
  const sent: any[] = [], edited: any[] = [], deleted: any[] = [];
  let failDelete = false, failEdit = false;
  const deps = {
    now: () => now,
    read: async () => structuredClone(state),
    save: async (key: string, value: any) => { state.discordWebhooks[key] = structuredClone(value); },
    remove: async (key: string) => { delete state.discordWebhooks[key]; },
    send: async (payload: any) => { sent.push(payload); return { ok: true as const, via: 'bot' as const, messageId: String(sent.length) }; },
    edit: async (payload: any) => { edited.push(payload); return !failEdit; },
    delete: async (record: any) => { deleted.push(record); return !failDelete; },
  };
  return { state, sent, edited, deleted, service: createMosaicReplyService(deps), deps,
    advance: (ms: number) => { now += ms; },
    failDelete: (value: boolean) => { failDelete = value; },
    failEdit: (value: boolean) => { failEdit = value; },
  };
}
const input = { channelId: '123', userId: 'user', userName: 'Painter', avatarUrl: 'https://cdn.discordapp.com/avatars/123/test.png', command: 'spmt b8k', content: 'Painted B8 black · +1', botToken: 'fake-test-token' };

test('one per-user message edits with five recent commands and user avatar', async () => {
  const h = harness();
  for (let i = 0; i < 7; i++) await h.service.reply({ ...input, command: 'spmt a' + (i + 1) + 'k' });
  assert.equal(h.sent.length, 1);
  assert.equal(h.edited.length, 6);
  const record = h.state.discordWebhooks['mosaic-reply:123:user'];
  assert.equal(record.history.length, 5);
  assert.equal(record.history[0].command, 'spmt a3k');
  assert.equal(h.sent[0].username, 'Painter');
  assert.equal(h.sent[0].avatarUrl, input.avatarUrl);
  assert.equal(h.edited[5].embeds[0].thumbnail.url, input.avatarUrl);
  assert.match(h.edited[5].embeds[0].fields[0].value, /spmt a3k/);
  assert.doesNotMatch(h.edited[5].embeds[0].fields[0].value, /spmt a1k/);
});

test('same painter in another channel and another painter never share embeds', async () => {
  const h = harness();
  await h.service.reply(input);
  await h.service.reply({ ...input, channelId: '456' });
  await h.service.reply({ ...input, userId: 'other' });
  assert.equal(h.sent.length, 3);
  assert.equal(h.edited.length, 0);
});

test('simultaneous commands serialize into one post', async () => {
  const h = harness();
  await Promise.all([h.service.reply(input), h.service.reply({ ...input, command: 'spmt c8k' })]);
  assert.equal(h.sent.length, 1);
  assert.equal(h.edited.length, 1);
  assert.equal(h.state.discordWebhooks['mosaic-reply:123:user'].history.length, 2);
});

test('editing does not extend first-post expiry; cleanup survives server restart', async () => {
  const h = harness();
  await h.service.reply(input);
  const expiry = h.state.discordWebhooks['mosaic-reply:123:user'].expiresAt;
  h.advance(MOSAIC_REPLY_WINDOW_MS - 100);
  await h.service.reply(input);
  assert.equal(h.state.discordWebhooks['mosaic-reply:123:user'].expiresAt, expiry);
  const restarted = createMosaicReplyService(h.deps);
  await restarted.cleanup('fake');
  assert.equal(h.deleted.length, 0);
  h.advance(100);
  await restarted.cleanup('fake');
  assert.equal(h.deleted.length, 1);
  assert.equal(Object.keys(h.state.discordWebhooks).length, 0);
});

test('delete failures persist for retry and cannot create duplicate messages', async () => {
  const h = harness();
  await h.service.reply(input);
  h.advance(MOSAIC_REPLY_WINDOW_MS);
  h.failDelete(true);
  await h.service.cleanup('fake');
  assert.equal(h.deleted.length, 1);
  await h.service.cleanup('fake');
  assert.equal(h.deleted.length, 1);
  await assert.rejects(h.service.reply(input), /cleanup is retrying/);
  assert.equal(h.sent.length, 1);
  h.failDelete(false);
  h.advance(30_000);
  await h.service.cleanup('fake');
  await h.service.reply(input);
  assert.equal(h.sent.length, 2);
});

test('failed edit does not post another message or lose persisted history', async () => {
  const h = harness();
  await h.service.reply(input);
  h.failEdit(true);
  await assert.rejects(h.service.reply(input), /could not be updated/);
  assert.equal(h.sent.length, 1);
  assert.equal(h.state.discordWebhooks['mosaic-reply:123:user'].history.length, 1);
});

test('legacy cleanup adopts only Mosaic command replies, never cards or other commands', () => {
  const state: any = {
    discordWebhooks: {
      'nebula-game:snow:pixelbattle': { gameId: 'pixelbattle', channel: 'snow', discordChannelId: '123' },
      '123': { id: 'webhook', token: 'fake', channelId: '123' },
    },
    discordMessages: { history: [
      { source: 'discord/chat', channelId: '123', messageId: 'old', transport: 'webhook', timestamp: new Date(1000).toISOString(), embeds: [{ title: 'Nebula Arcade · Mosaic', footer: { text: 'Painter • Spmt b8k' } }] },
      { source: 'discord/chat', channelId: '123', messageId: 'pack', transport: 'bot', embeds: [{ title: 'Nebula Arcade · Chat Tag', footer: { text: 'Painter • Spmt pack' } }] },
      { source: 'game-card', channelId: '123', messageId: 'painting', embeds: [{ title: 'Nebula Arcade · Mosaic' }] },
      { source: 'discord/chat', channelId: '456', messageId: 'other-channel', embeds: [{ title: 'Nebula Arcade · Mosaic', footer: { text: 'Painter • Spmt b8k' } }] },
    ] },
  };
  assert.equal(adoptLegacyMosaicReplies(state, 2000), true);
  assert.equal(adoptLegacyMosaicReplies(state, 2000), false);
  const keys = Object.keys(state.discordWebhooks).filter(k => k.startsWith('mosaic-reply:'));
  assert.deepEqual(keys, ['mosaic-reply:legacy:old']);
  assert.equal(state.discordWebhooks[keys[0]].expiresAt, 1000 + MOSAIC_REPLY_WINDOW_MS);
});
