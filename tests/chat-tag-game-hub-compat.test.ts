import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getPlayerGameSnapshots } from '../src/lib/game-hub-chat-summary';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('legacy Chat Tag root commands bypass Games Hub interception', () => {
  const route = read('src/app/api/game-hub/command/route.ts');
  assert.match(route, /LEGACY_CHAT_TAG_ROOT_COMMANDS = new Set\(\['help', 'rules', 'score'\]\)/);
  assert.match(route, /LEGACY_CHAT_TAG_ROOT_COMMANDS\.has\(command\)/);
  assert.match(route, /handled: false, legacyChatTag: true/);

  const legacyGuard = route.indexOf('LEGACY_CHAT_TAG_ROOT_COMMANDS.has(command)');
  const oldHubScoreHandler = route.indexOf("if (command === 'score')");
  assert.ok(legacyGuard >= 0 && oldHubScoreHandler >= 0 && legacyGuard < oldHubScoreHandler,
    'legacy score must fall through before the Games Hub score handler');
});

test('namespaced Chat Tag commands bypass per-channel ACTIVE gating', () => {
  const route = read('src/app/api/game-hub/command/route.ts');
  const globalCompat = route.indexOf("if (game.id === 'chat-tag' && action !== 'start' && action !== 'stop')");
  const activeGate = route.indexOf('if (!activeGameIds.includes(game.id))');
  assert.ok(globalCompat >= 0, 'missing global Chat Tag compatibility branch');
  assert.ok(activeGate >= 0 && globalCompat < activeGate,
    'Chat Tag compatibility must run before per-channel Games Hub ACTIVE gating');
  assert.match(route, /rewriteCommand: legacyChatTagRewrite\(actionArgs\)/);
  assert.match(route, /globalChatTag: true/);
});

test('legacy Tag players remain scoreable without a Games Hub membership migration', () => {
  const state: any = {
    gameSettings: {
      default: {
        gameHub: {
          channels: {},
          players: {},
          ledger: [],
        },
      },
    },
    tagPlayers: {
      user_123: {
        id: 'user_123',
        twitchUsername: 'legacyplayer',
        displayName: 'LegacyPlayer',
        passCount: 2,
        isActive: true,
      },
    },
    tagHistory: [
      { taggerId: 'user_123', taggedId: 'user_456' },
      { taggerId: 'user_123', taggedId: 'user_789' },
      { taggerId: 'user_456', taggedId: 'user_123' },
    ],
  };

  const [snapshot] = getPlayerGameSnapshots(state, ['chat-tag'], {
    userId: '123',
    username: 'legacyplayer',
  });

  assert.ok(snapshot, 'legacy Chat Tag player should produce a score snapshot');
  assert.equal(snapshot.joined, true);
  assert.equal(snapshot.active, true);
  assert.equal(snapshot.rank, 1);
  assert.match(snapshot.summary, /2 tags/);
  assert.match(snapshot.summary, /1 tagged/);
  assert.match(snapshot.summary, /2 passes/);
});
