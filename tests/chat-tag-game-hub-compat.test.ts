import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getPlayerGameSnapshots } from '../src/lib/game-hub-chat-summary';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function extractSender(source: string): string {
  const start = source.indexOf('async function sendChatWithSharedFallback');
  assert.ok(start >= 0, 'sendChatWithSharedFallback must exist');
  const nextFunction = source.indexOf('\nasync function ', start + 1);
  assert.ok(nextFunction > start, 'could not isolate sendChatWithSharedFallback');
  return source.slice(start, nextFunction);
}

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

test('deployed bot build keeps proven Chat Tag commands and sender routing intact', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-tag-game-hub-patch-'));
  const tempScripts = path.join(tempRoot, 'scripts');
  fs.mkdirSync(tempScripts, { recursive: true });
  const originalBot = read('bot.js');
  fs.copyFileSync(path.join(root, 'bot.js'), path.join(tempRoot, 'bot.js'));
  fs.copyFileSync(
    path.join(root, 'scripts/patch-game-hub-bot.mjs'),
    path.join(tempScripts, 'patch-game-hub-bot.mjs'),
  );

  try {
    execFileSync(process.execPath, [path.join(tempScripts, 'patch-game-hub-bot.mjs')], {
      cwd: tempRoot,
      stdio: 'pipe',
    });
    const patchedBot = fs.readFileSync(path.join(tempRoot, 'bot.js'), 'utf8');

    assert.match(patchedBot, /const legacyChatTagCommands = new Set\(/);
    assert.match(patchedBot, /if \(!legacyChatTagCommands\.has\(cmd\)\)/);
    assert.match(patchedBot, /const chatTagNamespace = cmd === 'chattag' \|\| cmd === 'taggame'/);
    assert.match(patchedBot, /Chat Tag is always active globally; no channel start is required/);
    assert.match(patchedBot, /CHAT_TAG_API_TIMEOUT_MS/);

    const legacyGuard = patchedBot.indexOf('if (!legacyChatTagCommands.has(cmd))');
    const hubCall = patchedBot.indexOf("apiCall('/api/game-hub/command'");
    const scoreHandler = patchedBot.indexOf("cmd === 'score'");
    const liveHandler = patchedBot.indexOf("cmd === 'live'");
    assert.ok(legacyGuard >= 0 && hubCall > legacyGuard, 'Games Hub API call must be inside the legacy-command guard');
    assert.ok(scoreHandler >= 0 && liveHandler >= 0, 'score/live must remain present in the deployed bot source');

    // Critical production invariant: the build patch must not alter the proven
    // normal-vs-shared Twitch sender at all.
    assert.equal(extractSender(patchedBot), extractSender(originalBot));
    const sender = extractSender(patchedBot);
    assert.match(sender, /const inSharedChat = Boolean\(member\?\.isSharedChat\)/);
    assert.match(sender, /sendMessageViaAPI\(normalized, message, true\)/);
    assert.match(sender, /await client\.say\(`#\$\{normalized\}`, message\)/);

    // IRC disconnects must make Fly health fail again, and Twitch NOTICE events
    // must be visible for auth/moderation/chat-mode rejection diagnosis.
    assert.match(patchedBot, /ok: isIrcConnected/);
    assert.match(patchedBot, /res\.writeHead\(isIrcConnected \? 200 : 503/);
    assert.match(patchedBot, /client\.on\('notice'/);
    assert.match(patchedBot, /Twitch NOTICE channel=/);

    execFileSync(process.execPath, ['--check', path.join(tempRoot, 'bot.js')], {
      cwd: tempRoot,
      stdio: 'pipe',
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('bot Fly health follows Twitch IRC readiness', () => {
  const patch = read('scripts/patch-game-hub-bot.mjs');
  assert.match(patch, /IRC-aware bot health contract is missing/);
  assert.match(patch, /res\.writeHead\(isIrcConnected \? 200 : 503/);
  assert.doesNotMatch(patch, /const healthReplacement/);
  assert.doesNotMatch(patch, /ok: true,\\n        ready: isIrcConnected/);
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
