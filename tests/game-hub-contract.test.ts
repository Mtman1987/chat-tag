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
  resolveDirectGameCommand,
} from '../src/lib/game-hub-commands';
import {
  cloneGameOverlayProfile,
  createGameOverlayProfile,
  instantGameOverlayProfile,
  instantGameOverlayProfileId,
  patchGameOverlayProfile,
} from '../src/lib/game-hub-overlays';
import {
  fitCompactReplyWithLink,
  gamesPointsStandings,
  getPlayerGameSnapshots,
} from '../src/lib/game-hub-chat-summary';
import { nebulaPrototypeMessage } from '../src/lib/nebula-game-message';
import { getGameHubInstructions, setGameHubInstructions } from '../src/lib/game-hub-instructions';
import {
  PHRASE_GUESS_PHRASES,
  WORD_CHAIN_THEMES,
  getOrCreateGameHubPlayer,
  phraseGuessPublicSnapshot,
  phraseGuessRoundAt,
  phraseGuessRoundForChannel,
  purchasePhraseGuessHint,
  recordPhraseGuessAttempt,
  recordWordChainMessage,
  submitPhraseGuessPhrase,
  submitWordChainTheme,
  wordChainPublicSnapshot,
  wordChainRoundAt,
} from '../src/lib/game-hub-state';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Games Hub catalogs 18 peer games after retiring Color Wars and Memory Lane', () => {
  assert.equal(GAME_HUB_CATALOG.length, 18);
  assert.equal(new Set(GAME_HUB_CATALOG.map((game) => game.id)).size, 18);
  for (const expected of ['chat-tag', 'quackverse', 'bingo']) assert.ok(getGameHubGame(expected), `missing ${expected}`);
  const recovered = GAME_HUB_CATALOG.filter((game) => game.sourcePrototype?.startsWith('games/'));
  assert.equal(recovered.length, 13);
  for (const expected of [
    'chaosmode', 'chatgarden', 'chatwars', 'chickenroyale', 'colorsymphony',
    'dancingparade', 'emojirain', 'emojitower',
    'petrace', 'phraseguess', 'pixelbattle', 'rhythmpulse', 'treasurehunt',
    'wordchain', 'wordstorm',
  ]) assert.ok(getGameHubGame(expected), `missing ${expected}`);
});

test('all recovered Library games ship as embedded Nebula pages with parent event support', () => {
  const directory = path.join(root, 'public/nebula-arcade/games');
  const files = fs.readdirSync(directory).filter((file) => file.endsWith('.html')).sort();
  assert.equal(files.length, 13);
  for (const file of files) {
    const source = fs.readFileSync(path.join(directory, file), 'utf8');
    assert.match(source, /window\.parent/);
    assert.match(source, /embedded/);
  }
  const home = read('src/components/nebula-arcade-showcase.tsx');
  assert.match(home, /ROTATION_MS/);
  assert.match(home, /NebulaGameFrame/);
  assert.match(home, /NativeGamePreview/);
  assert.doesNotMatch(home, /filter\(\(game\) => Boolean\(game\.sourcePrototype\)\)/);
  assert.match(home, /demo/);
});

test('Discord showcase ships one animated frame for every Nebula Arcade game', () => {
  const asset = fs.readFileSync(path.join(root, 'public/brand/nebula-arcade-games-showcase.gif'));
  const generator = read('scripts/generate-nebula-discord-showcase.py');
  let frameCount = 0;
  for (let index = 0; index < asset.length - 2; index += 1) {
    if (asset[index] === 0x21 && asset[index + 1] === 0xf9 && asset[index + 2] === 0x04) frameCount += 1;
  }

  assert.equal(asset.subarray(0, 6).toString(), 'GIF89a');
  assert.equal(frameCount, GAME_HUB_CATALOG.length);
  for (const game of GAME_HUB_CATALOG) assert.match(generator, new RegExp(`\\("${game.name}",`));
  assert.match(generator, /duration=2900/);
  assert.match(read('src/app/games/page.tsx'), /nebula-arcade-games-showcase\.gif/);
});

test('every Games Hub chat command uses the spmt namespace', () => {
  assert.equal(GAME_HUB_COMMAND_SPECS.length, 18);
  for (const game of GAME_HUB_CATALOG) {
    const playerCommands = canonicalPlayerCommands(game);
    const streamerCommands = canonicalStreamerCommands(game);
    assert.ok(playerCommands.length >= 2, `${game.id} needs join/leave commands`);
    for (const command of [...playerCommands, ...streamerCommands]) {
      assert.match(command.trigger, /^(?:spmt\s+|!mosaic\s+)/i, `${game.id} leaked an unsupported command prefix`);
      if (!/^!mosaic\s+/i.test(command.trigger)) assert.doesNotMatch(command.trigger, /^!/);
    }
  }
  const chatTag = canonicalPlayerCommands(getGameHubGame('chat-tag')!);
  assert.ok(chatTag.some((command) => command.trigger === 'spmt join'));
  assert.ok(chatTag.some((command) => command.trigger === 'spmt tag @user'));
  const bingo = canonicalPlayerCommands(getGameHubGame('bingo')!);
  assert.ok(bingo.some((command) => command.trigger === 'spmt bingo B4'));
  assert.ok(bingo.some((command) => command.trigger === 'spmt bingo flip B4'));
  assert.ok(bingo.some((command) => command.trigger === 'spmt bingo free'));
});

test('direct commands preserve Chat Tag and route colors only to Chat Wars', () => {
  const joined = resolveDirectGameCommand(['join'], ['chatgarden']);
  assert.equal(joined.mode, 'choose');
  assert.deepEqual(joined.intents.map((item) => item.gameId), ['chat-tag', 'chatgarden']);

  const tagOnly = resolveDirectGameCommand(['join'], []);
  assert.equal(tagOnly.mode, 'single');
  assert.equal(tagOnly.intents[0].command, 'spmt chattag');

  const colors = resolveDirectGameCommand(['red'], ['chatwars']);
  assert.equal(colors.mode, 'single');
  assert.deepEqual(colors.intents.map((item) => item.gameId), ['chatwars']);

  const chaos = resolveDirectGameCommand(['explode'], ['chaosmode']);
  assert.equal(chaos.intents[0].command, 'spmt chaos explode');
  assert.equal(resolveDirectGameCommand(['explode'], []).intents.length, 0);

  const hint = resolveDirectGameCommand(['hint'], ['phraseguess']);
  assert.equal(hint.intents[0].command, 'spmt phrase hint');
  assert.equal(resolveDirectGameCommand(['hint'], []).intents.length, 0);

  const internal = resolveDirectGameCommand(['chicken', 'start'], ['chickenroyale']);
  assert.equal(internal.recognized, false);
});

test('Nebula translates every legacy prototype command without changing ordinary chat', () => {
  const cases: Array<[string, string, string]> = [
    ['chaosmode', 'spmt explode', '!explode'],
    ['chaosmode', 'spmt glitch', '!glitch'],
    ['chaosmode', 'spmt portal', '!portal'],
    ['chaosmode', 'spmt shake', '!shake'],
    ['chatwars', 'spmt red', '!red'],
    ['chickenroyale', 'spmt chicken', '!join'],
    ['chickenroyale', 'spmt hatch', '!join'],
    ['chickenroyale', 'spmt chicken start', '!start'],
    ['chaosmode', 'spmt chaos portal', '!portal'],
    ['dancingparade', 'spmt parade', '!join'],
    ['dancingparade', 'spmt dance', '!dance'],
    ['emojitower', 'spmt drop', '!drop'],
    ['petrace', 'spmt pet rabbit', '!join rabbit'],
    ['petrace', 'spmt petrace turtle', '!join turtle'],
    ['pixelbattle', 'spmt paint cyan 10 5', 'paint cyan 10 5'],
    ['pixelbattle', 'spmt pixel red 3 7', 'paint red 3 7'],
    ['treasurehunt', 'spmt dig B5', '!dig b5'],
    ['treasurehunt', 'spmt treasure A4', '!dig a4'],
  ];
  for (const [gameId, command, expected] of cases) {
    assert.equal(nebulaPrototypeMessage(gameId, command), expected, `${gameId}: ${command}`);
  }
  for (const gameId of ['chatgarden', 'colorsymphony', 'emojirain', 'rhythmpulse', 'wordstorm']) {
    assert.equal(nebulaPrototypeMessage(gameId, 'purple memories 🌱'), 'purple memories 🌱');
  }
  assert.equal(nebulaPrototypeMessage('wordchain', 'spmt chain'), 'spmt chain');
  assert.equal(nebulaPrototypeMessage('phraseguess', 'spmt phrase hint'), 'spmt phrase hint');
});

test('Phrase Guess hint tiers spend the durable Games Points wallet once per round tier', () => {
  const state: any = { gameSettings: { default: {} } };
  const player = {
    userId: '42', username: 'viewer', displayName: 'Viewer', channel: 'space', now: 0,
  };
  getOrCreateGameHubPlayer(state, player).gamePointsBalance = 110;
  const stored = purchasePhraseGuessHint(state, player);
  const second = purchasePhraseGuessHint(state, { ...player, now: 1 });
  const third = purchasePhraseGuessHint(state, { ...player, now: 2 });
  assert.deepEqual([stored.cost, second.cost, third.cost], [10, 25, 50]);
  assert.equal(third.balance, 25);
  assert.throws(() => purchasePhraseGuessHint(state, { ...player, now: 3 }), /three hints/i);
  const nextRound = purchasePhraseGuessHint(state, { ...player, now: 6 * 60_000 });
  assert.equal(nextRound.cost, 10);
  assert.equal(nextRound.tier, 1);
});

test('Phrase Guess wins and wrong guesses settle against the durable wallet once per wall-clock round', () => {
  const state: any = { gameSettings: { default: {} } };
  const identity = { userId: '7', username: 'solver', displayName: 'Solver' };
  const player = getOrCreateGameHubPlayer(state, identity);
  player.gamePointsBalance = 10;
  player.joinedGames.phraseguess = { joinedAt: new Date(0).toISOString(), active: true, score: 0, wins: 0, plays: 1 };
  const storedPlayer = () => state.gameSettings.default.gameHub.players['twitch:7'];

  assert.equal(phraseGuessRoundAt(0).phrase, PHRASE_GUESS_PHRASES[0]);
  const wrong = recordPhraseGuessAttempt(state, { ...identity, channel: 'space', message: 'definitely wrong', now: 0 });
  assert.equal(wrong.outcome, 'wrong');
  assert.equal(storedPlayer().gamePointsBalance, 9);

  const won = recordPhraseGuessAttempt(state, { ...identity, channel: 'space', message: PHRASE_GUESS_PHRASES[0], now: 1 });
  assert.equal(won.outcome, 'won');
  assert.equal(storedPlayer().gamePointsBalance, 59);
  assert.equal(storedPlayer().joinedGames.phraseguess.wins, 1);

  const duplicate = recordPhraseGuessAttempt(state, { ...identity, channel: 'space', message: PHRASE_GUESS_PHRASES[0], now: 2 });
  assert.equal(duplicate.outcome, 'closed');
  assert.equal(storedPlayer().gamePointsBalance, 59);

  const next = phraseGuessRoundAt(6 * 60_000);
  const nextWin = recordPhraseGuessAttempt(state, { ...identity, channel: 'space', message: next.phrase, now: 6 * 60_000 });
  assert.equal(nextWin.outcome, 'won');
  assert.equal(storedPlayer().gamePointsBalance, 109);
});

test('community Phrase Guess submissions enter rotation and reward their submitter when solved', () => {
  const state: any = { gameSettings: { default: {} } };
  const submitter = { userId: '21', username: 'writer', displayName: 'Writer' };
  const solver = { userId: '22', username: 'solver', displayName: 'Solver' };
  const submitted = submitPhraseGuessPhrase(state, { ...submitter, channel: 'space', phrase: 'Starlight finds a way', now: 0 });
  assert.equal(submitted.inventorySize, 1);
  assert.throws(
    () => submitPhraseGuessPhrase(state, { ...submitter, channel: 'space', phrase: 'starlight finds a way', now: 1 }),
    /already/i,
  );
  const solverPlayer = getOrCreateGameHubPlayer(state, solver);
  solverPlayer.joinedGames.phraseguess = { joinedAt: new Date(0).toISOString(), active: true, score: 0, wins: 0, plays: 1 };
  const communityRoundAt = 2 * 6 * 60_000;
  const round = phraseGuessRoundForChannel(state, 'space', communityRoundAt);
  assert.equal(round.phrase, 'Starlight finds a way');
  assert.equal(round.submitterDisplayName, 'Writer');
  const result = recordPhraseGuessAttempt(state, { ...solver, channel: 'space', message: round.phrase, now: communityRoundAt });
  assert.equal(result.outcome, 'won');
  assert.equal(result.submitterReward, 5);
  assert.equal(state.gameSettings.default.gameHub.players['twitch:21'].gamePointsBalance, 5);
  assert.equal(state.gameSettings.default.gameHub.players['twitch:22'].gamePointsBalance, 50);
});

test('Word Chain settles canonical words, combos, and neutral majority votes durably', () => {
  const state: any = { gameSettings: { default: {} } };
  const first = { userId: '11', username: 'alpha', displayName: 'Alpha' };
  const second = { userId: '12', username: 'beta', displayName: 'Beta' };
  for (const identity of [first, second]) {
    const player = getOrCreateGameHubPlayer(state, identity);
    player.joinedGames.wordchain = { joinedAt: new Date(0).toISOString(), active: true, score: 0, wins: 0, plays: 1 };
  }
  const stored = (id: string) => state.gameSettings.default.gameHub.players[`twitch:${id}`];

  assert.deepEqual(wordChainRoundAt(0), { roundSlot: 0, theme: 'Animals', seed: WORD_CHAIN_THEMES.Animals[0] });
  const raccoon = recordWordChainMessage(state, { ...first, channel: 'space', message: 'raccoon', now: 0 });
  const newt = recordWordChainMessage(state, { ...first, channel: 'space', message: 'newt', now: 1 });
  assert.equal(raccoon.outcome, 'accepted');
  assert.equal(raccoon.points, 7);
  assert.equal(newt.outcome, 'accepted');
  assert.equal(newt.points, 6);
  assert.equal(stored('11').gamePointsBalance, 13);
  assert.equal(stored('11').joinedGames.wordchain.score, 13);

  const pending = recordWordChainMessage(state, { ...first, channel: 'space', message: 'truck', now: 2 });
  assert.equal(pending.outcome, 'vote-opened');
  assert.equal(recordWordChainMessage(state, { ...second, channel: 'space', message: 'yes', now: 3 }).outcome, 'voted');
  const afterVote = recordWordChainMessage(state, { ...second, channel: 'space', message: 'kangaroo', now: 20_003 });
  assert.equal(afterVote.finalized?.accepted, true);
  assert.equal(afterVote.outcome, 'accepted');
  assert.equal(stored('11').gamePointsBalance, 23);
  assert.equal(stored('12').gamePointsBalance, 8);
});

test('main word games ship seeded libraries, community additions, and broadcast snapshots', () => {
  assert.ok(PHRASE_GUESS_PHRASES.length >= 20);
  assert.ok(Object.keys(WORD_CHAIN_THEMES).length >= 8);
  const state: any = { gameSettings: { default: {} } };
  const creator = { userId: '31', username: 'maker', displayName: 'Maker', channel: 'space', now: 0 };
  const player = getOrCreateGameHubPlayer(state, creator);
  player.joinedGames.wordchain = { joinedAt: new Date(0).toISOString(), active: true, score: 0, wins: 0, plays: 1 };
  player.joinedGames.phraseguess = { joinedAt: new Date(0).toISOString(), active: true, score: 0, wins: 0, plays: 1 };
  const theme = submitWordChainTheme(state, { ...creator, name: 'Weather', words: 'storm, rain, snow, thunder' });
  assert.equal(theme.entry.words.length, 4);
  assert.equal(theme.inventorySize, 1);
  assert.throws(() => submitWordChainTheme(state, { ...creator, name: 'Weather', words: 'cloud, mist, wind, hail', now: 1 }), /already exists/i);
  const chain = wordChainPublicSnapshot(state, 'space', 0);
  assert.equal(chain.theme, 'Animals');
  assert.equal(chain.currentWord, 'TIGER');
  assert.equal(chain.requiredLetter, 'R');
  const phrase = phraseGuessPublicSnapshot(state, 'space', 0);
  assert.ok(phrase.maskedPhrase.includes('•'));
  assert.equal(phrase.secondsLeft, 360);
});

test('overlay game selection is deduped, valid, Bingo-aware and bounded', () => {
  const ids = normalizeGameHubGameIds([
    'bingo', 'chat-tag', 'chat-tag', 'nope', 'quackverse', 'emojirain', 'wordstorm',
    'petrace', 'chatwars', 'treasurehunt', 'pixelbattle', 'chaosmode',
  ]);
  assert.equal(ids.length, 10);
  assert.deepEqual(ids.slice(0, 3), ['bingo', 'chat-tag', 'quackverse']);
  assert.ok(!ids.includes('nope'));
});

test('overlay profiles default to one all-game rotating Nebula surface and remain cloneable', () => {
  const blank = createGameOverlayProfile('12345', { ownerLogin: 'SpaceMountainLive' });
  assert.equal(blank.gameIds.length, 18);
  assert.equal(blank.layout, 'rotation');
  assert.ok(blank.gameIds.includes('chat-tag'));

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

test('SpaceMountain Lounge splits large word stages from compact activity games', () => {
  const route = read('src/app/api/overlay/game-hub/[profileId]/route.ts');
  assert.match(route, /'system-spacemountainlive-main'[\s\S]*gameIds: \['wordchain', 'phraseguess'\][\s\S]*layout: 'rotation'/);
  assert.match(route, /'system-spacemountainlive-activity'/);
  for (const gameId of ['chatwars', 'pixelbattle', 'treasurehunt', 'bingo']) {
    assert.match(route, new RegExp(`['"]${gameId}['"]`));
  }
  for (const disabledGameId of ['chaosmode', 'chatgarden', 'chickenroyale', 'colorsymphony', 'emojitower', 'petrace', 'rhythmpulse', 'wordstorm']) {
    const systemProfile = route.slice(route.indexOf("'system-spacemountainlive-main'"), route.indexOf("'system-spacemountainlive-rain'"));
    assert.doesNotMatch(systemProfile, new RegExp(`['"]${disabledGameId}['"]`));
  }
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
  const bus = read('src/lib/game-hub-event-bus.ts');
  const state = read('src/lib/game-hub-state.ts');
  const points = read('src/app/api/game-hub/points/route.ts');
  assert.match(ingest, /isBotRequest/);
  assert.match(ingest, /appendNebulaChatEvent/);
  assert.match(ingest, /scoreWriteDue/);
  assert.match(bus, /MAX_EVENTS_PER_CHANNEL = 250/);
  assert.match(bus, /10 \* 60 \* 1000/);
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
    '@viewer Nebula Arcade scores:',
    Array.from({ length: 20 }, (_, index) => `[Game ${index + 1}] [${index + 1}th] ${1000 - index} score · 4 wins · 12 plays`),
    link,
  );
  assert.ok(reply.length <= 480);
  assert.match(reply, /Nebula Arcade scores:/);
  assert.match(reply, /\[Game 1\]/);
  assert.ok(reply.endsWith(link));
  assert.match(reply, /\+\d+ more/);
});

test('game commands return the per-game learn-by-doing popout', () => {
  const command = read('src/app/api/game-hub/command/route.ts');
  const overlayRoute = read('src/app/api/overlay/game-hub/[profileId]/route.ts');
  assert.match(command, /function gamePopoutUrl/);
  assert.match(command, /function instantGameOverlayUrl/);
  assert.match(command, /function gameReplyWithPopout/);
  assert.match(command, /getPublicAppOrigin\(req\)/);
  assert.match(command, /\/games\/\$\{encodeURIComponent\(gameId\)\}\?channel=/);
  assert.match(command, /\^\(\?:control\|controls\|popout\)\$/);
  assert.match(command, /Learn and play:/);
  assert.match(command, /learn by playing, see its rules and commands/);
  assert.match(command, /Only the streamer or a moderator can \$\{action\} \$\{game\.name\}[\s\S]*gameReplyWithPopout/);
  assert.match(command, /gameReplyWithPopout\(req, channel, game\.id, `@\$\{displayName\} \$\{game\.name\} is not ACTIVE/);
  assert.match(command, /launchUrl: url/);
  assert.match(command, /copy into an OBS Browser Source/);
  assert.match(command, /overlayUrl/);
  assert.match(overlayRoute, /instantGameOverlayProfile\(id\)/);
});

test('instant game overlays are transparent, focused, and channel isolated', () => {
  const id = instantGameOverlayProfileId('Friend_Channel', 'pixelbattle');
  assert.equal(id, 'instant.friend_channel.pixelbattle');
  assert.deepEqual(instantGameOverlayProfile(id), {
    id,
    ownerUserId: 'twitch-channel:friend_channel',
    ownerLogin: 'friend_channel',
    name: 'Nebula Mosaic for #friend_channel',
    gameIds: ['pixelbattle'],
    layout: 'focus',
    transparent: true,
    createdAt: 'instant',
    updatedAt: 'instant',
  });
  assert.equal(instantGameOverlayProfileId('friend_channel', 'not-a-game'), null);
  assert.equal(instantGameOverlayProfile('instant.friend_channel.not-a-game'), null);
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
  assert.match(command, /Nebula Arcade scores:/);
  assert.match(command, /Nebula Arcade profile:/);
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
  assert.match(leader, /All 18 games/);
  assert.match(leader, /spmt leader/);
  assert.match(pointsLeaderboard, /Games Points leaderboard/);
  assert.match(pointsLeaderboard, /spmt pleader/);
  assert.match(summary, /chatTagSnapshot/);
  assert.match(summary, /bingoSummary/);
  assert.match(summary, /TWITCH_REPLY_LIMIT = 480/);
  assert.match(scope, /stoppedGameIds/);
  assert.match(scope, /resolveChannelGameIds/);
});

test('read-only game scope, word stage, Bingo board, and guide pages stay public for OBS and chat links', () => {
  const middleware = read('src/middleware.ts');
  assert.match(middleware, /'\/games'/);
  assert.match(middleware, /isPublicGameScopeRead/);
  assert.match(middleware, /pathname === '\/api\/game-hub\/channel'/);
  assert.match(middleware, /isPublicWordStageRead/);
  assert.match(middleware, /pathname === '\/api\/game-hub\/word-stage'/);
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

test('Bingo uses a shared anti-cheat board, transcript triggers, Stella defense, and tiered Games Points purchases', () => {
  const stateRoute = read('src/app/api/game-hub/shared-bingo/route.ts');
  const transcript = read('src/app/api/game-hub/bingo-transcript/route.ts');
  const surface = read('src/components/game-hub-bingo-surface.tsx');
  const model = read('src/lib/shared-bingo.ts');
  const command = read('src/app/api/game-hub/command/route.ts');
  assert.match(stateRoute, /getSessionUserFromRequest/);
  assert.match(stateRoute, /settleExpiredBingoClaims/);
  assert.match(transcript, /isBotRequest/);
  assert.match(transcript, /ingestBingoTranscript/);
  assert.match(transcript, /queueStellaSpeech/);
  assert.match(model, /BINGO_CLAIM_WINDOW_MS = 15_000/);
  assert.match(model, /BINGO_PHRASE_CHANGE_COST = 100/);
  assert.match(model, /BINGO_STELLA_FLIP_COST = 250/);
  assert.match(model, /BINGO_CENTER_FREE_COST = 500/);
  assert.match(model, /completeBingoIfWon/);
  assert.match(model, /Streamer Bingo bonus/);
  assert.match(surface, /broadcastOnly/);
  assert.match(surface, /cell\.coordinate/);
  assert.match(command, /buyBingoStellaFlip/);
  assert.match(command, /buyBingoCenterFree/);
});

test('Bingo revival uses the same Play slot and restores the old route safely', () => {
  const detail = read('src/app/games/[gameId]/page.tsx');
  const play = read('src/components/game-hub-play-panel.tsx');
  const legacy = read('src/app/bingo/page.tsx');
  assert.match(detail, /GameHubPlayPanel/);
  assert.match(play, /GameHubBingoSurface/);
  assert.match(play, /ChatTagGame/);
  assert.match(play, /QuackverseCardGame/);
  assert.match(play, /GameHubPrototypeSurface/);
  assert.match(play, /is STOPPED/);
  assert.match(play, /spmt start/);
  assert.match(play, /NebulaGameFrame/);
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

test('all chat games separate broadcast visuals from full popout controls', () => {
  const surface = read('src/components/game-hub-surface.tsx');
  const prototype = read('src/components/game-hub-prototype-surface.tsx');
  const bingo = read('src/components/game-hub-bingo-surface.tsx');
  const frame = read('src/components/nebula-game-frame.tsx');

  assert.match(surface, /LARGE_STAGE_GAMES = new Set\(\['wordchain', 'phraseguess'\]\)/);
  assert.match(surface, /game\.sourcePrototype && !LARGE_STAGE_GAMES\.has\(game\.id\)/);
  assert.match(surface, /GameHubPrototypeSurface[\s\S]*broadcastOnly/);
  assert.match(surface, /GameHubBingoSurface channel=\{channel \|\| 'chat'\} broadcastOnly=\{!chrome\}/);
  assert.match(prototype, /PixelBoard[\s\S]*gridOnly=\{broadcastOnly\}/);
  assert.match(prototype, /TreasureBoard[\s\S]*gridOnly=\{broadcastOnly\}/);
  assert.match(prototype, /fetch\(`\/api\/game-hub\/mosaic\?channel=/);
  assert.doesNotMatch(prototype, /<button[\s\S]*PixelBoard/);
  assert.match(prototype, /broadcastOnly \? 'grid w-full p-0' : 'p-4'/);
  assert.match(bingo, /!broadcastOnly &&[\s\S]*Shared card/);
  assert.match(bingo, /aria-label="Bingo grid"/);
  assert.match(frame, /embedded: '1'/);
  assert.match(frame, /if \(broadcastOnly\) query\.set\('broadcast', '1'\)/);
});

test('every game exposes a separate show-hide instruction overlay', () => {
  const command = read('src/app/api/game-hub/command/route.ts');
  const commands = read('src/lib/game-hub-commands.ts');
  const route = read('src/app/api/game-hub/instructions/route.ts');
  const overlay = read('src/app/overlay/game-hub/instructions/[channel]/page.tsx');
  const studio = read('src/app/overlay/games/page.tsx');

  assert.match(command, /command === 'instructions'/);
  assert.match(command, /setGameHubInstructions/);
  assert.match(commands, /spmt instructions \$\{spec\.key\}/);
  assert.match(commands, /spmt instructions hide/);
  assert.match(route, /canonicalPlayerCommands/);
  assert.match(overlay, /data-nebula-instructions/);
  assert.match(overlay, /game\.commands\.map/);
  assert.match(studio, /Separate instructions browser source/);
  assert.match(studio, /instructionOverlayUrl/);

  const state: any = { gameSettings: { default: {} } };
  assert.equal(getGameHubInstructions(state, 'spacemountainlive'), null);
  const shown = setGameHubInstructions(state, 'SpaceMountainLive', 'pixelbattle');
  assert.equal(shown.visible, true);
  assert.equal(getGameHubInstructions(state, 'spacemountainlive')?.gameId, 'pixelbattle');
  const hidden = setGameHubInstructions(state, 'spacemountainlive', null);
  assert.equal(hidden.visible, false);
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


test('Quackverse launches as a browser room while the community overlay stays pack-only', () => {
  const command = read('src/app/api/game-hub/command/route.ts');
  const profile = read('src/app/api/overlay/game-hub/[profileId]/route.ts');
  const commands = read('src/lib/game-hub-commands.ts');

  assert.match(command, /function quackversePlayUrl/);
  assert.match(command, /overlayMode: 'pack-only'/);
  assert.match(command, /setChannelGameRunning\(state, channel, game\.id, false\)/);
  assert.match(commands, /joinTrigger: 'spmt quackverse'/);
  assert.match(commands, /spmt pack[\s\S]*reveal appears on stream/);
  assert.doesNotMatch(profile, /gameIds: \['quackverse', 'bingo'/);
});
