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
