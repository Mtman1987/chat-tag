import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  GAME_HUB_CATALOG,
  getGameHubGame,
  normalizeGameHubGameIds,
} from '../src/lib/game-hub-registry';
import {
  GAME_HUB_COMMAND_SPECS,
  canonicalPlayerCommands,
  canonicalStreamerCommands,
} from '../src/lib/game-hub-commands';
import {
  cloneGameOverlayProfile,
  createGameOverlayProfile,
  patchGameOverlayProfile,
} from '../src/lib/game-hub-overlays';
import {
  fitCompactReplyWithLink,
  gamesPointsStandings,
  getPlayerGameSnapshots,
} from '../src/lib/game-hub-chat-summary';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Games Hub catalogs 20 peer games including Bingo and all 17 recovered games', () => {
  assert.equal(GAME_HUB_CATALOG.length, 20);
  assert.equal(new Set(GAME_HUB_CATALOG.map((game) => game.id)).size, 20);
  for (const expected of ['chat-tag', 'quackverse', 'bingo']) assert.ok(getGameHubGame(expected), `missing ${expected}`);
  const recovered = GAME_HUB_CATALOG.filter((game) => game.sourcePrototype?.startsWith('games/'));
  assert.equal(recovered.length, 17);
  for (const expected of [
    'chaosmode', 'chatgarden', 'chatwars', 'chickenroyale', 'colorsymphony',
    'colorwars', 'dancingparade', 'emojirain', 'emojitower', 'memorylane',
    'petrace', 'phraseguess', 'pixelbattle', 'rhythmpulse', 'treasurehunt',
    'wordchain', 'wordstorm',
  ]) assert.ok(getGameHubGame(expected), `missing ${expected}`);
});

test('every Games Hub chat command uses the spmt namespace', () => {
  assert.equal(GAME_HUB_COMMAND_SPECS.length, 20);
  for (const game of GAME_HUB_CATALOG) {
    const playerCommands = canonicalPlayerCommands(game);
    const streamerCommands = canonicalStreamerCommands(game);
    assert.ok(playerCommands.length >= 2, `${game.id} needs join/leave commands`);
    for (const command of [...playerCommands, ...streamerCommands]) {
      assert.match(command.trigger, /^spmt\s+/i, `${game.id} leaked a non-SPMT command`);
      assert.doesNotMatch(command.trigger, /^!/);
    }
  }
  const chatTag = canonicalPlayerCommands(getGameHubGame('chat-tag')!);
  assert.ok(chatTag.some((command) => command.trigger === 'spmt chattag'));
  assert.ok(chatTag.some((command) => command.trigger === 'spmt chattag tag @user'));
  const bingo = canonicalPlayerCommands(getGameHubGame('bingo')!);
  assert.ok(bingo.some((command) => command.trigger.startsWith('spmt bingo center ')));
});

test('overlay game selection is deduped, valid, Bingo-aware and bounded', () => {
  const ids = normalizeGameHubGameIds([
    'bingo', 'chat-tag', 'chat-tag', 'nope', 'quackverse', 'emojirain', 'wordstorm',
    'petrace', 'chatwars', 'colorwars', 'treasurehunt', 'pixelbattle', 'chaosmode',
  ]);
  assert.equal(ids.length, 8);
  assert.deepEqual(ids.slice(0, 3), ['bingo', 'chat-tag', 'quackverse']);
  assert.ok(!ids.includes('nope'));
});

test('overlay profiles are neutral, cloneable and do not default to Chat Tag', () => {
  const blank = createGameOverlayProfile('12345', { ownerLogin: 'SpaceMountainLive' });
  assert.deepEqual(blank.gameIds, []);

  const created = createGameOverlayProfile('12345', {
    ownerLogin: 'SpaceMountainLive',
    name: 'Party Mix',
    gameIds: ['bingo', 'emojirain'],
    layout: 'auto-grid',
  });
  assert.equal(created.ownerLogin, 'spacemountainlive');
  assert.deepEqual(created.gameIds, ['bingo', 'emojirain']);

  const patched = patchGameOverlayProfile(created, { gameIds: ['wordstorm'], layout: 'focus' });
  assert.deepEqual(patched.gameIds, ['wordstorm']);
  assert.equal(patched.layout, 'focus');
  assert.equal(patched.id, created.id);

  const cloned = cloneGameOverlayProfile('12345', patched);
  assert.notEqual(cloned.id, patched.id);
  assert.equal(cloned.ownerLogin, 'spacemountainlive');
  assert.deepEqual(cloned.gameIds, ['wordstorm']);
});

test('bot image patches resolved chat, canonical Games Hub commands and Chat Tag compatibility rewrite', () => {
  const patcher = read('scripts/patch-game-hub-bot.mjs');
  const dockerfile = read('Dockerfile.bot');
  assert.match(patcher, /resolvedChannel/);
  assert.match(patcher, /api\/game-hub\/chat/);
  assert.match(patcher, /api\/game-hub\/command/);
  assert.match(patcher, /gamesHubCommand\?\.handled/);
  assert.match(patcher, /rewriteCommand/);
  assert.match(patcher, /let args = normalizedMsg/);
  assert.match(patcher, /fire-and-forget/i);
  assert.match(dockerfile, /patch-game-hub-bot\.mjs/);
  assert.match(dockerfile, /RUN node scripts\/patch-game-hub-bot\.mjs/);
});

test('game event transport is bounded and Games Points are a separate wallet', () => {
  const ingest = read('src/app/api/game-hub/chat/route.ts');
  const reader = read('src/app/api/overlay/game-hub/events/route.ts');
  const state = read('src/lib/game-hub-state.ts');
  const points = read('src/app/api/game-hub/points/route.ts');
  assert.match(ingest, /isBotRequest/);
  assert.match(ingest, /MAX_EVENTS_PER_CHANNEL = 250/);
  assert.match(ingest, /10 \* 60 \* 1000/);
  assert.match(reader, /MAX_READ_EVENTS = 100/);
  assert.match(reader, /Cache-Control.*no-store/);
  assert.match(state, /gamePointsBalance/);
  assert.match(state, /lifetimeEarned/);
  assert.match(state, /lifetimeSpent/);
  assert.match(points, /spendGameHubPoints/);
  assert.doesNotMatch(points, /spmt\/xp|communityPoints/i);
});

test('leaving a game preserves leaderboard history while stopping participation', () => {
  const state = read('src/lib/game-hub-state.ts');
  assert.match(state, /active: boolean/);
  assert.match(state, /membership\.active = false/);
  assert.doesNotMatch(state, /delete player\.joinedGames\[gameId\]/);
  assert.match(state, /if \(!membership\?\.active\) continue/);
  assert.match(state, /filter\(\(player\) => player\.active\)/);
});

test('compact replies preserve useful text before a link and stay under Twitch limits', () => {
  const link = 'https://example.test/games/rules?channel=space';
  const reply = fitCompactReplyWithLink(
    '@viewer Games Hub scores:',
    Array.from({ length: 20 }, (_, index) => `[Game ${index + 1}] [${index + 1}th] ${1000 - index} score · 4 wins · 12 plays`),
    link,
  );
  assert.ok(reply.length <= 480);
  assert.match(reply, /Games Hub scores:/);
  assert.match(reply, /\[Game 1\]/);
  assert.ok(reply.endsWith(link));
  assert.match(reply, /\+\d+ more/);
});

test('score snapshots expose real Chat Tag and personal Bingo counters', () => {
  const state: any = {
    gameSettings: {
      default: {
        gameHub: {
          channels: {},
          ledger: [],
          players: {
            'twitch:1': {
              id: 'twitch:1',
              username: 'alice',
              displayName: 'Alice',
              gamePointsBalance: 25,
              lifetimeEarned: 30,
              lifetimeSpent: 5,
              joinedGames: {
                'chat-tag': { joinedAt: '2026-01-01T00:00:00.000Z', active: true, score: 0, wins: 0, plays: 1 },
                bingo: { joinedAt: '2026-01-01T00:00:00.000Z', active: true, score: 12, wins: 2, plays: 1 },
              },
            },
            'twitch:2': {
              id: 'twitch:2',
              username: 'bob',
              displayName: 'Bob',
              gamePointsBalance: 40,
              lifetimeEarned: 40,
              lifetimeSpent: 0,
              joinedGames: {
                'chat-tag': { joinedAt: '2026-01-01T00:00:00.000Z', active: true, score: 0, wins: 0, plays: 1 },
                bingo: { joinedAt: '2026-01-01T00:00:00.000Z', active: true, score: 14, wins: 3, plays: 1 },
              },
            },
          },
        },
      },
    },
    tagPlayers: {
      user_1: { id: 'user_1', twitchUsername: 'alice', passCount: 3 },
      user_2: { id: 'user_2', twitchUsername: 'bob', passCount: 0 },
    },
    tagHistory: [
      { taggerId: 'user_1', taggedId: 'user_2' },
      { taggerId: 'user_1', taggedId: 'user_2' },
      { taggerId: 'user_2', taggedId: 'user_1' },
    ],
    bingoCards: {
      personalBoards: {
        'twitch:1': { centerPhrase: 'Chat says hydrate', covered: { 0: {}, 1: {}, 2: {}, 3: {}, 12: {} } },
      },
    },
  };

  const snapshots = getPlayerGameSnapshots(state, ['chat-tag', 'bingo'], { userId: '1', username: 'alice' });
  assert.equal(snapshots.length, 2);
  assert.match(snapshots[0].summary, /2 tags/);
  assert.match(snapshots[0].summary, /1 tagged/);
  assert.match(snapshots[0].summary, /3 passes/);
  assert.match(snapshots[1].summary, /2 bingos/);
  assert.match(snapshots[1].summary, /5\/25/);
  assert.match(snapshots[1].summary, /20 left/);
  assert.equal(gamesPointsStandings(state)[0].username, 'bob');
});

test('rules and score stay ACTIVE-scoped while leader mirrors StreamWeaver-style all-game profile semantics', () => {
  const command = read('src/app/api/game-hub/command/route.ts');
  const help = read('src/app/games/help/page.tsx');
  const rules = read('src/app/games/rules/page.tsx');
  const score = read('src/app/games/score/page.tsx');
  const leader = read('src/app/games/leader/page.tsx');
  const pointsLeaderboard = read('src/app/games/leaderboard/page.tsx');
  const summary = read('src/lib/game-hub-chat-summary.ts');
  const scope = read('src/lib/game-hub-state.ts');

  assert.match(command, /command === 'help'/);
  assert.match(command, /command === 'score'/);
  assert.match(command, /command === 'leader'/);
  assert.match(command, /command === 'pleader'/);
  assert.match(command, /fitCompactReplyWithLink/);
  assert.match(command, /Games Hub scores:/);
  assert.match(command, /Games Hub profile:/);
  assert.match(command, /Games Points leaders:/);
  assert.match(command, /games\/score\?channel=/);
  assert.match(command, /games\/leader\?player=/);
  assert.match(command, /games\/leaderboard/);
  assert.match(command, /resolveChannelGameIds\(state, channel\)/);
  assert.match(help, /redirect\(channel \? `\/games\/rules\?channel=/);
  assert.match(rules, /resolveChannelGameIds/);
  assert.match(rules, /spmt leader/);
  assert.match(rules, /spmt pleader/);
  assert.match(score, /resolveChannelGameIds/);
  assert.match(score, /getPlayerGameSnapshots/);
  assert.match(score, /Historical scores in stopped games remain stored/);
  assert.match(leader, /All 20 games/);
  assert.match(leader, /spmt leader/);
  assert.match(pointsLeaderboard, /Games Points leaderboard/);
  assert.match(pointsLeaderboard, /spmt pleader/);
  assert.match(summary, /chatTagSnapshot/);
  assert.match(summary, /bingoSummary/);
  assert.match(summary, /TWITCH_REPLY_LIMIT = 480/);
  assert.match(scope, /stoppedGameIds/);
  assert.match(scope, /resolveChannelGameIds/);
});

test('read-only game scope, Bingo board, and guide pages stay public for OBS and chat links', () => {
  const middleware = read('src/middleware.ts');
  assert.match(middleware, /'\/games'/);
  assert.match(middleware, /isPublicGameScopeRead/);
  assert.match(middleware, /pathname === '\/api\/game-hub\/channel'/);
  assert.match(middleware, /isPublicBingoStateRead/);
  assert.match(middleware, /pathname === '\/api\/bingo\/state'/);
});

test('activity bell removes Bingo notifications and replaces them with Games Hub scope/activity', () => {
  const feed = read('src/components/activity-feed.tsx');
  const activity = read('src/app/api/game-hub/activity/route.ts');
  assert.doesNotMatch(feed, /api\/bingo\/state/);
  assert.doesNotMatch(feed, /Recent Bingo/);
  assert.match(feed, /Active game scopes/);
  assert.match(feed, /Recent game players/);
  assert.match(feed, /Games Points/);
  assert.match(activity, /activeScopes/);
  assert.match(activity, /recentPlayers/);
});

test('Bingo uses canonical identity, personal boards, personal center rules, and shared Games Points', () => {
  const bingo = read('src/app/api/bingo/state/route.ts');
  const card = read('src/components/bingo-card.tsx');
  const model = read('src/lib/bingo-game.ts');
  const generate = read('src/app/api/bingo/generate/route.ts');
  const command = read('src/app/api/game-hub/command/route.ts');
  assert.match(bingo, /getSessionUserFromRequest/);
  assert.match(bingo, /requireAdminRequest/);
  assert.match(bingo, /alreadyClaimedInStream/);
  assert.match(bingo, /getPersonalBingoBoard/);
  assert.match(bingo, /BINGO_CENTER_INDEX/);
  assert.match(bingo, /setPersonalBingoCenter/);
  assert.match(bingo, /newlyWon/);
  assert.match(bingo, /joinGameHubGame/);
  assert.match(bingo, /awardGameHubPoints/);
  assert.match(bingo, /gameId: 'bingo'/);
  assert.doesNotMatch(bingo, /postOrUpdateChatTagEmbed/);
  assert.doesNotMatch(bingo, /getScoringSettings/);
  assert.doesNotMatch(bingo, /player\.bingoPoints/);
  assert.match(model, /BINGO_CENTER_PLACEHOLDER/);
  assert.match(model, /personalBoards/);
  assert.match(model, /hasBingo/);
  assert.doesNotMatch(model, /FREE SPACE/);
  assert.match(card, /centerNeedsPhrase/);
  assert.match(card, /handleSetCenterPhrase/);
  assert.match(card, /isFreeSpace=\{false\}/);
  assert.match(card, /Your personal center square/);
  assert.match(card, /user\?\.isAdmin/);
  assert.match(generate, /resetPersonalBingoProgress/);
  assert.match(command, /game\.id === 'bingo' && action === 'center'/);
});

test('Bingo revival uses the same Play slot and restores the old route safely', () => {
  const detail = read('src/app/games/[gameId]/page.tsx');
  const play = read('src/components/game-hub-play-panel.tsx');
  const legacy = read('src/app/bingo/page.tsx');
  assert.match(detail, /GameHubPlayPanel/);
  assert.match(play, /BingoCard/);
  assert.match(play, /ChatTagGame/);
  assert.match(play, /QuackverseCardGame/);
  assert.match(play, /GameHubPrototypeSurface/);
  assert.match(play, /is STOPPED/);
  assert.match(play, /spmt \{commandKey\} start/);
  assert.match(legacy, /redirect\('\/games\/bingo'\)/);
});

test('all game detail pages and composite slots use peer templates', () => {
  const detail = read('src/app/games/[gameId]/page.tsx');
  const overlay = read('src/app/overlay/game-hub/[profileId]/page.tsx');
  const surface = read('src/components/game-hub-surface.tsx');
  const home = read('src/app/page.tsx');
  assert.match(detail, /Leaderboard/);
  assert.match(detail, /Players/);
  assert.match(detail, /Streamer commands/);
  assert.match(detail, /GameHubControlPanel/);
  assert.match(detail, /GameHubPlayPanel/);
  assert.doesNotMatch(detail, /nativePath/);
  assert.match(overlay, /GameHubSurface/);
  assert.doesNotMatch(overlay, /game\.id === 'chat-tag'/);
  assert.doesNotMatch(overlay, /game\.id === 'quackverse'/);
  assert.match(surface, /data-game-hub-surface/);
  assert.match(home, /redirect\('\/games'\)/);
});

test('composite game overlays remain shell-free while the editor stays in the normal app shell', () => {
  const rootShell = read('src/components/root-shell.tsx');
  const overlay = read('src/app/overlay/game-hub/[profileId]/page.tsx');
  const studio = read('src/app/game-overlays/page.tsx');
  assert.match(rootShell, /pathname\.startsWith\('\/overlay\/game-hub\/'\)/);
  assert.doesNotMatch(rootShell, /pathname\.startsWith\('\/game-overlays/);
  assert.match(overlay, /GameHubSurface/);
  assert.match(studio, /app\/overlay\/games\/page/);
});
