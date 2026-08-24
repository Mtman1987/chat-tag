import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getGameHubRuntimeActions, recordGameHubRuntimeAction } from '../src/lib/game-hub-runtime';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('runtime actions persist by channel and game and survive unrelated reads', () => {
  const state: any = { gameSettings: { default: {} } };
  const first = recordGameHubRuntimeAction(state, {
    channel: '#SpaceMountainLive',
    gameId: 'chaosmode',
    actorId: '123',
    username: 'mtman1987',
    displayName: 'Mtman1987',
    action: 'explode',
    args: [],
    message: 'spmt chaos explode',
  });
  recordGameHubRuntimeAction(state, {
    channel: 'spacemountainlive',
    gameId: 'pixelbattle',
    actorId: '456',
    username: 'viewer',
    displayName: 'Viewer',
    action: 'red',
    args: ['10', '5'],
    message: 'spmt pixel red 10 5',
  });

  const chaos = getGameHubRuntimeActions(state, 'spacemountainlive', { gameIds: ['chaosmode'] });
  assert.equal(chaos.length, 1);
  assert.equal(chaos[0].id, first.id);
  assert.equal(chaos[0].action, 'explode');
  assert.equal(chaos[0].message, 'spmt chaos explode');

  const after = getGameHubRuntimeActions(state, 'spacemountainlive', { after: first.id });
  assert.equal(after.length, 1);
  assert.equal(after[0].gameId, 'pixelbattle');
});

test('command routing records targeted commands while ordinary chat stays off the volume', () => {
  const ingest = read('src/app/api/game-hub/chat/route.ts');
  const command = read('src/app/api/game-hub/command/route.ts');
  assert.match(command, /recordGameHubRuntimeAction/);
  assert.match(ingest, /runtimeActionId: null/);
  assert.doesNotMatch(ingest, /targetedGame/);
  assert.match(ingest, /appendNebulaChatEvent/);
});

test('OBS and in-app play surfaces consume durable runtime actions and keep passive chat separate', () => {
  const overlay = read('src/app/overlay/game-hub/[profileId]/page.tsx');
  const play = read('src/components/game-hub-play-panel.tsx');
  for (const source of [overlay, play]) {
    assert.match(source, /\/api\/overlay\/game-hub\/runtime/);
    assert.match(source, /isSpmtCommand/);
    assert.match(source, /gameIds: \[action\.gameId\]/);
  }
});
