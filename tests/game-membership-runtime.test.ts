import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('chat events carry only ACTIVE joined game scope', () => {
  const ingest = read('src/app/api/game-hub/chat/route.ts');
  assert.match(ingest, /participatingGameIds/);
  assert.match(ingest, /player\?\.joinedGames\?\.\[gameId\]\?\.active === true/);
  assert.match(ingest, /targetedGameId/);
  assert.match(ingest, /result\.activeGameIds\.includes\(commandGameId\)/);
  assert.match(ingest, /gameIds/);
});

test('public overlay events preserve only validated game ids', () => {
  const reader = read('src/app/api/overlay/game-hub/events/route.ts');
  assert.match(reader, /publicGameIds/);
  assert.match(reader, /getGameHubGame/);
  assert.match(reader, /gameIds: publicGameIds/);
});

test('OBS and in-app prototype surfaces filter the shared stream by game id', () => {
  const surface = read('src/components/game-hub-surface.tsx');
  const play = read('src/components/game-hub-play-panel.tsx');
  for (const source of [surface, play]) {
    assert.match(source, /eventsForGame/);
    assert.match(source, /gameIds/);
    assert.match(source, /\.includes\(gameId\)/);
  }
  assert.match(play, /Only joined players feed this game while it is ACTIVE/);
});
