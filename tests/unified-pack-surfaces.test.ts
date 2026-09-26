import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createQuackversePackMediaEvent, quackversePackRenderUrl } from '../src/lib/quackverse-pack-media';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Quackverse pack media uses the shared card-pack-opened contract', () => {
  const event = createQuackversePackMediaEvent({
    eventId: 'qpack-123',
    username: 'viewer',
    cards: [{ id: 7, name: 'Space Duck', rarity: 'Epic', cardImageUrl: 'https://example.test/duck.png' }],
  });
  assert.equal(event.type, 'card-pack-opened');
  assert.equal(event.game, 'quackverse');
  assert.equal(event.eventId, 'qpack-123');
  assert.equal(event.cards[0].setCode, 'QV');
  assert.match(quackversePackRenderUrl(event), /\/overlay\/card-pack\?/);
});

test('production build wires same-message Discord GIF replacement without reopening packs', async () => {
  const patch = await read('scripts/patch-unified-pack-surfaces.mjs');
  assert.match(patch, /editDiscordSentMessage/);
  assert.match(patch, /queueQuackversePackGif/);
  assert.match(patch, /waitForQuackversePackGif/);
  assert.match(patch, /eventId: String\(packData\.packId\)/);
  assert.doesNotMatch(patch, /action:\s*['"]open['"]/);
});

test('Quackverse forwards the real pack id to the shared live overlay', async () => {
  const patch = await read('scripts/patch-unified-pack-surfaces.mjs');
  assert.match(patch, /eventId: input\.packId/);
  assert.match(patch, /packId: input\.packId/);
});


test('Quackverse awaits the StreamWeaver live overlay handoff before returning', async () => {
  const route = await read('src/app/api/quackverse/pack/route.ts');
  assert.match(route, /await notifyStreamWeaverPackOverlay\(\{/);
  assert.match(route, /StreamWeaver overlay notified/);
});


test('Quackverse Discord pack summary uses inline card fields and edits the same message with the GIF', async () => {
  const route = await read('src/app/api/quackverse/pack/present/route.ts');
  assert.match(route, /cardFields/);
  assert.match(route, /inline: true/);
  assert.match(route, /editDiscordSentMessage/);
  assert.match(route, /gifUrl/);
});

test('Quackverse Twitch pack presenter passes the source channel into GIF capture branding', async () => {
  const patch = await read('scripts/patch-quackverse-pack-bot.mjs');
  assert.match(patch, /streamweaverTenantId: channelName/);
  const media = await read('src/lib/quackverse-pack-media.ts');
  assert.match(media, /tenantParam/);
  assert.match(media, /queueQuackversePackGif\(event: QuackversePackMediaEvent, tenantId\?: string\)/);
});


test('Quackverse Discord pack uses a fixed three-column text grid with pending animation notice', async () => {
  const route = await read('src/app/api/quackverse/pack/present/route.ts');
  assert.match(route, /Cards · 3 across/);
  assert.match(route, /PACK ANIMATION INCOMING/);
  assert.match(route, /inline: false/);
  assert.doesNotMatch(route, /const cardFields = input\.pack/);
});

test('Quackverse Discord edit uploads the rendered GIF as an attachment', async () => {
  const route = await read('src/app/api/quackverse/pack/present/route.ts');
  const editor = await read('src/lib/discord-message-edit.ts');
  assert.match(route, /attachment:\/\/\$\{attachmentName\}/);
  assert.match(route, /attachmentUrl: render\.gifUrl/);
  assert.match(editor, /FormData/);
  assert.match(editor, /files\[0\]/);
  assert.match(editor, /attachments: \[\{ id: 0, filename: attachmentName \}\]/);
});


test('direct Discord spmt pack route uses fixed grid, pending notice, and attached GIF', async () => {
  const route = await read('src/app/api/discord/chat/route.ts');
  assert.match(route, /Cards · 3 across/);
  assert.match(route, /PACK ANIMATION INCOMING/);
  assert.match(route, /attachment:\/\/\$\{attachmentName\}/);
  assert.match(route, /attachmentUrl: render\.gifUrl/);
  assert.doesNotMatch(route, /const cardFields = packCards/);
});

test('prebuild does not overwrite the fixed direct Discord pack presenter', async () => {
  const patch = await read('scripts/patch-unified-pack-surfaces.mjs');
  assert.match(patch, /direct Discord pack presenter already uses fixed grid\/attachment flow/);
  assert.match(patch, /Cards · 3 across/);
  assert.match(patch, /PACK ANIMATION INCOMING/);
});
