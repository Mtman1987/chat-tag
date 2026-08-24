import { NextRequest, NextResponse } from 'next/server';
import { isBotRequest } from '@/lib/auth';
import { getGameHubGame } from '@/lib/game-hub-registry';
import {
  canonicalCommandSummary,
  canonicalJoinCommand,
  resolveDirectGameCommand,
  resolveGameHubCommandKey,
} from '@/lib/game-hub-commands';
import { recordGameHubRuntimeAction } from '@/lib/game-hub-runtime';
import {
  awardGameHubPoints,
  joinGameHubGame,
  leaveGameHubGame,
  normalizeGameHubChannel,
  normalizeGameHubPlayerId,
  resolveChannelGameIds,
  setChannelGameRunning,
} from '@/lib/game-hub-state';
import {
  allPlayedGameIds,
  compactGameSnapshot,
  fitCompactReplyWithLink,
  gamesPointsStandings,
  getGamesPointsStanding,
  getPlayerGameSnapshots,
} from '@/lib/game-hub-chat-summary';
import {
  BINGO_CENTER_INDEX,
  bingoTemplatePhrases,
  getPersonalBingoBoard,
  hasBingo,
  setPersonalBingoCenter,
} from '@/lib/bingo-game';
import { readAppState, updateAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

const LEGACY_CHAT_TAG_ROOT_COMMANDS = new Set(['help', 'rules', 'score']);

function parseSpmt(message: unknown): string[] {
  const raw = String(message || '').trim();
  const match = raw.match(/^!?@?spmt(?:\s+|$)(.*)$/i);
  if (!match) return [];
  return String(match[1] || '').trim().split(/\s+/).filter(Boolean);
}

function knownAction(gameId: string, args: string[]): boolean {
  if (!args.length) return true;
  const first = args[0].toLowerCase();
  if (first === 'start' || first === 'stop' || first === 'leave') return true;
  if (gameId === 'chat-tag') return /^(tag|pass|score|status)$/.test(first);
  if (gameId === 'bingo') {
    return (first === 'center' && args.length >= 2)
      || (first === 'claim' && /^([1-9]|1\d|2[0-5])$/.test(args[1] || '') && args.length === 2)
      || (first === 'phrases' && args.length === 1);
  }
  if (gameId === 'chaosmode') return /^(explode|glitch|portal|shake)$/.test(first) && args.length === 1;
  if (gameId === 'chatwars' || gameId === 'colorwars') return /^(red|blue|green|yellow)$/.test(first) && args.length === 1;
  if (gameId === 'dancingparade') return first === 'dance' && args.length === 1;
  if (gameId === 'emojitower') return first === 'drop' && args.length === 1;
  if (gameId === 'petrace') return /^(dog|cat|rabbit|turtle|hamster)$/.test(first) && args.length === 1;
  if (gameId === 'pixelbattle') return /^(red|blue|green|yellow|purple|orange|pink|white|black|cyan)$/.test(first) && /^\d{1,2}$/.test(args[1] || '') && /^\d{1,2}$/.test(args[2] || '') && args.length === 3;
  if (gameId === 'treasurehunt') return /^[a-h][1-8]$/i.test(first) && args.length === 1;
  return false;
}

function publicOrigin(req: NextRequest) {
  return req.nextUrl.origin.replace(/\/$/, '');
}

function guideUrl(req: NextRequest, channel: string) {
  return `${publicOrigin(req)}/games/rules?channel=${encodeURIComponent(channel)}`;
}

function scoreUrl(req: NextRequest, channel: string, username: string) {
  return `${publicOrigin(req)}/games/score?channel=${encodeURIComponent(channel)}&player=${encodeURIComponent(username)}`;
}

function leaderUrl(req: NextRequest, username: string) {
  return `${publicOrigin(req)}/games/leader?player=${encodeURIComponent(username)}`;
}

function pointsLeaderboardUrl(req: NextRequest) {
  return `${publicOrigin(req)}/games/leaderboard`;
}

function legacyChatTagRewrite(actionArgs: string[]) {
  if (!actionArgs.length) return 'spmt join';
  if (actionArgs[0] === 'leave') return 'spmt leave';
  return `spmt ${actionArgs.join(' ')}`;
}

export async function POST(req: NextRequest) {
  if (!isBotRequest(req)) {
    return NextResponse.json({ error: 'Bot service authentication required.' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  let parts = parseSpmt(body.message);
  if (!parts.length) return NextResponse.json({ handled: false });

  const channel = normalizeGameHubChannel(body.channel);
  const username = normalizeGameHubChannel(body.username);
  const displayName = String(body.displayName || username).trim().slice(0, 80) || username;
  const userId = body.userId;
  if (!channel || !username) return NextResponse.json({ handled: false });

  let command = parts[0].toLowerCase();

  // Player-facing Nebula Arcade commands are short ("spmt explode",
  // "spmt pet dog", "spmt dig B5"). Namespaced forms remain an internal
  // compatibility transport so old links and bot rewrites keep working.
  const directState = await readAppState();
  const activeForDirectRouting = resolveChannelGameIds(directState, channel);
  const direct = resolveDirectGameCommand(parts, activeForDirectRouting);
  if (direct.recognized) {
    if (!direct.intents.length) {
      return NextResponse.json({ handled: true, reply: `@${displayName} That Nebula Arcade game is not ACTIVE in #${channel}.` });
    }
    if (direct.mode === 'choose') {
      const choices = direct.intents.map((candidate, index) => ({
        number: index + 1,
        gameId: candidate.gameId,
        label: getGameHubGame(candidate.gameId)?.name || candidate.gameId,
        command: candidate.command,
      }));
      const menu = choices.map((choice) => `${choice.number} ${choice.label}`).join(' · ');
      return NextResponse.json({
        handled: true,
        choices,
        reply: `@${displayName} What game would you like to ${command}? ${menu}. Type the number within 30 seconds.`.slice(0, 480),
      });
    }
    if (direct.mode === 'broadcast' && direct.intents.length > 1) {
      const names = await updateAppState((draft) => direct.intents.map((candidate) => {
        const game = getGameHubGame(candidate.gameId)!;
        joinGameHubGame(draft, { userId, username, displayName, gameId: game.id });
        recordGameHubRuntimeAction(draft, {
          channel,
          gameId: game.id,
          actorId: userId,
          username,
          displayName,
          action: candidate.actionArgs[0] || 'join',
          args: candidate.actionArgs.slice(1),
          message: String(body.message || ''),
        });
        return game.name;
      }));
      return NextResponse.json({ handled: true, reply: `@${displayName} ${command} applied to ${names.join(' and ')}.` });
    }
    parts = parseSpmt(direct.intents[0].command);
    command = parts[0].toLowerCase();
  }

  // Chat Tag predates Games Hub and is a persistent ecosystem-wide game. Keep
  // its original root commands backward compatible so existing players never
  // need to rejoin or relearn commands just because Games Hub is installed.
  if (LEGACY_CHAT_TAG_ROOT_COMMANDS.has(command)) {
    return NextResponse.json({ handled: false, legacyChatTag: true });
  }

  if (command === 'help' || command === 'rules' || command === 'games') {
    const activeIds = activeForDirectRouting;
    if (!activeIds.length) {
      return NextResponse.json({ handled: true, reply: `@${displayName} No Nebula Arcade games are ACTIVE in #${channel}.` });
    }
    const segments = activeIds.map((gameId) => {
      const game = getGameHubGame(gameId);
      return game ? `[${game.shortName}] ${canonicalJoinCommand(game)}` : gameId;
    });
    const prefix = command === 'games'
      ? `@${displayName} Active in #${channel}:`
      : `@${displayName} Nebula Arcade ${command} for #${channel}:`;
    return NextResponse.json({
      handled: true,
      reply: fitCompactReplyWithLink(prefix, segments, guideUrl(req, channel)),
    });
  }

  if (command === 'score') {
    const state = directState;
    const activeIds = activeForDirectRouting;
    if (!activeIds.length) {
      return NextResponse.json({ handled: true, reply: `@${displayName} No Nebula Arcade games are ACTIVE in #${channel}.` });
    }
    const snapshots = getPlayerGameSnapshots(state, activeIds, { userId, username });
    return NextResponse.json({
      handled: true,
      reply: fitCompactReplyWithLink(
        `@${displayName} Nebula Arcade scores:`,
        snapshots.map(compactGameSnapshot),
        scoreUrl(req, channel, username),
      ),
    });
  }

  if (command === 'leader') {
    const state = await readAppState();
    const standing = getGamesPointsStanding(state, userId, username);
    const playedIds = allPlayedGameIds(state, userId, username);
    const snapshots = getPlayerGameSnapshots(state, playedIds, { userId, username })
      .sort((left, right) => right.score - left.score || right.wins - left.wins);
    const wallet = standing
      ? `${standing.balance.toLocaleString()} GP [#${standing.rank}] · ${playedIds.length} games`
      : `0 GP · ${playedIds.length} games`;
    return NextResponse.json({
      handled: true,
      reply: fitCompactReplyWithLink(
        `@${displayName} Nebula Arcade profile: ${wallet}`,
        snapshots.map(compactGameSnapshot),
        leaderUrl(req, username),
      ),
    });
  }

  if (command === 'points') {
    const state = await readAppState();
    const standing = getGamesPointsStanding(state, userId, username);
    if (!standing) {
      return NextResponse.json({ handled: true, reply: `@${displayName} Games Points: 0 · unranked. Games Points are spendable and separate from SPMT XP.` });
    }
    return NextResponse.json({
      handled: true,
      reply: `@${displayName} Games Points: ${standing.balance.toLocaleString()} · rank #${standing.rank} · earned ${standing.lifetimeEarned.toLocaleString()} · spent ${standing.lifetimeSpent.toLocaleString()}.`,
    });
  }

  if (command === 'pleader' || command === 'leaderboard' || command === 'rankings') {
    const state = await readAppState();
    const leaders = gamesPointsStandings(state).slice(0, 5);
    if (!leaders.length) {
      return NextResponse.json({ handled: true, reply: `@${displayName} No Games Points have been recorded yet.` });
    }
    const segments = leaders.map((entry) => `#${entry.rank} ${entry.displayName || entry.username} ${entry.balance.toLocaleString()}`);
    return NextResponse.json({
      handled: true,
      reply: fitCompactReplyWithLink(
        `@${displayName} Games Points leaders:`,
        segments,
        pointsLeaderboardUrl(req),
      ),
    });
  }

  const spec = resolveGameHubCommandKey(command);
  if (!spec) return NextResponse.json({ handled: false });
  const game = getGameHubGame(spec.gameId);
  if (!game) return NextResponse.json({ handled: false });
  const rawActionArgs = parts.slice(1);
  const actionArgs = rawActionArgs.map((part) => part.toLowerCase());
  const action = String(actionArgs[0] || '').toLowerCase();
  const canControl = Boolean(body.isBroadcaster || body.isModerator || body.isAdmin || username === channel);

  // Chat Tag is global and persistent, not a per-channel Games Hub session.
  // Namespaced Chat Tag commands are compatibility aliases for the legacy
  // parser and must never be blocked by a channel ACTIVE/STOPPED setting.
  if (game.id === 'chat-tag' && action !== 'start' && action !== 'stop') {
    if (!knownAction(game.id, actionArgs)) {
      return NextResponse.json({
        handled: true,
        reply: `@${displayName} ${game.name}: ${canonicalCommandSummary(game)}`.slice(0, 480),
      });
    }

    if (action === 'leave') {
      const playerId = normalizeGameHubPlayerId(userId, username);
      await updateAppState((draft) => leaveGameHubGame(draft, playerId, game.id));
    } else if (!actionArgs.length) {
      await updateAppState((draft) => joinGameHubGame(draft, {
        userId,
        username,
        displayName,
        gameId: game.id,
      }));
    }

    return NextResponse.json({
      handled: false,
      rewriteCommand: legacyChatTagRewrite(actionArgs),
      gameHubHandled: true,
      globalChatTag: true,
    });
  }

  if (action === 'start' || action === 'stop') {
    if (!canControl) {
      return NextResponse.json({ handled: true, reply: `@${displayName} Only the streamer or a moderator can ${action} ${game.name}.` });
    }
    const activeIds = await updateAppState((state) => {
      setChannelGameRunning(state, channel, game.id, action === 'start');
      recordGameHubRuntimeAction(state, {
        channel,
        gameId: game.id,
        actorId: userId,
        username,
        displayName,
        action,
        args: actionArgs.slice(1),
        message: String(body.message || ''),
      });
      return resolveChannelGameIds(state, channel);
    });
    return NextResponse.json({
      handled: true,
      reply: `${game.name} is now ${action === 'start' ? 'ACTIVE' : 'STOPPED'} in #${channel}.`,
      activeGameIds: activeIds,
    });
  }

  const state = await readAppState();
  const activeGameIds = resolveChannelGameIds(state, channel);
  if (!activeGameIds.includes(game.id)) {
    return NextResponse.json({ handled: true, reply: `@${displayName} ${game.name} is not ACTIVE in #${channel}.` });
  }

  if (!knownAction(game.id, actionArgs)) {
    return NextResponse.json({
      handled: true,
      reply: `@${displayName} ${game.name}: ${canonicalCommandSummary(game)}`.slice(0, 480),
    });
  }

  if (game.id === 'bingo' && action === 'phrases') {
    const phrases = bingoTemplatePhrases(state);
    const preview = phrases.slice(0, 5).map((phrase, index) => `${index + 1} ${phrase}`).join(' · ');
    return NextResponse.json({
      handled: true,
      reply: `@${displayName} Bingo phrases: ${preview} · Full card: ${publicOrigin(req)}/games/bingo`.slice(0, 480),
    });
  }

  if (game.id === 'bingo' && action === 'claim') {
    const displaySquare = Number(actionArgs[1]);
    const squareIndex = displaySquare - 1;
    const result = await updateAppState((draft) => {
      const joined = joinGameHubGame(draft, { userId, username, displayName, gameId: game.id });
      const board = getPersonalBingoBoard(draft, joined.player.id, true)!;
      if (squareIndex === BINGO_CENTER_INDEX && !board.centerPhrase) {
        return { error: 'Set your personal center phrase on the Bingo page before claiming square 13.' };
      }
      if (board.covered[String(squareIndex)]) return { error: `Square ${displaySquare} is already claimed on your card.` };
      const alreadyClaimedInStream = Object.values(board.covered).some((square: any) =>
        normalizeGameHubChannel(square?.streamerChannel) === channel
      );
      if (alreadyClaimedInStream) return { error: `You already claimed a Bingo square in #${channel}.` };

      const now = new Date().toISOString();
      board.covered[String(squareIndex)] = { userId: String(userId || username), username, streamerChannel: channel, claimedAt: now };
      board.updatedAt = now;
      joined.membership.lastActiveAt = now;
      joined.membership.score += 1;
      awardGameHubPoints(draft, joined.player, 1, 'Bingo square claimed', { gameId: game.id, channel });
      const newlyWon = hasBingo(board.covered) && !board.wonAt;
      if (newlyWon) {
        board.wonAt = now;
        joined.membership.score += 5;
        joined.membership.wins += 1;
        awardGameHubPoints(draft, joined.player, 5, 'Bingo completed', { gameId: game.id, channel });
      }
      recordGameHubRuntimeAction(draft, {
        channel, gameId: game.id, actorId: userId, username, displayName,
        action: 'claim', args: [String(displaySquare)], message: String(body.message || ''),
      });
      return { newlyWon, gameScore: joined.membership.score };
    });
    if ('error' in result) return NextResponse.json({ handled: true, reply: `@${displayName} ${result.error}` });
    return NextResponse.json({
      handled: true,
      reply: `@${displayName} claimed Bingo square ${displaySquare}${result.newlyWon ? ' — BINGO! +6 Games Points' : ' · +1 Games Point'} · score ${result.gameScore}.`,
    });
  }

  if (action === 'leave') {
    const playerId = normalizeGameHubPlayerId(userId, username);
    const left = await updateAppState((draft) => {
      const result = leaveGameHubGame(draft, playerId, game.id);
      recordGameHubRuntimeAction(draft, {
        channel, gameId: game.id, actorId: userId, username, displayName,
        action: 'leave', args: [], message: String(body.message || ''),
      });
      return result;
    });
    if (game.id === 'chat-tag') {
      return NextResponse.json({ handled: false, rewriteCommand: legacyChatTagRewrite(actionArgs), gameHubHandled: true });
    }
    return NextResponse.json({ handled: true, reply: `@${displayName} ${left ? `left ${game.name}.` : `was not joined to ${game.name}.`}` });
  }

  if (game.id === 'bingo' && action === 'center') {
    const phrase = rawActionArgs.slice(1).join(' ').trim();
    try {
      await updateAppState((draft) => {
        const joined = joinGameHubGame(draft, { userId, username, displayName, gameId: game.id });
        setPersonalBingoCenter(draft, {
          userId: String(userId || username),
          username,
          displayName,
          avatarUrl: '',
          playerKey: joined.player.id,
        }, phrase);
      });
      return NextResponse.json({ handled: true, reply: `@${displayName} your personal Bingo center is set to “${phrase.slice(0, 120)}”.` });
    } catch (error: any) {
      return NextResponse.json({ handled: true, reply: `@${displayName} ${error?.message || 'Your Bingo center phrase could not be saved.'}` });
    }
  }

  const result = await updateAppState((draft) => {
    const joined = joinGameHubGame(draft, { userId, username, displayName, gameId: game.id });
    recordGameHubRuntimeAction(draft, {
      channel,
      gameId: game.id,
      actorId: userId,
      username,
      displayName,
      action: actionArgs[0] || 'join',
      args: actionArgs.slice(1),
      message: String(body.message || ''),
    });
    return joined;
  });

  if (game.id === 'chat-tag') {
    return NextResponse.json({
      handled: false,
      rewriteCommand: legacyChatTagRewrite(actionArgs),
      gameHubHandled: true,
    });
  }

  if (!actionArgs.length) {
    return NextResponse.json({
      handled: true,
      reply: `@${displayName} ${result.alreadyJoined ? `you are already playing ${game.name}.` : `joined ${game.name}!`} ${canonicalJoinCommand(game)}`,
    });
  }

  return NextResponse.json({
    handled: true,
    reply: result.alreadyJoined
      ? `@${displayName} ${game.shortName}: ${actionArgs.join(' ')} registered.`
      : `@${displayName} joined ${game.name} · ${actionArgs.join(' ')} registered.`,
  });
}
