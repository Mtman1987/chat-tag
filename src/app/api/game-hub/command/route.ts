import { NextRequest, NextResponse } from 'next/server';
import { isBotRequest } from '@/lib/auth';
import { getGameHubGame } from '@/lib/game-hub-registry';
import {
  canonicalCommandSummary,
  canonicalJoinCommand,
  getCanonicalGameCommandSpec,
  resolveGameHubCommandKey,
} from '@/lib/game-hub-commands';
import {
  getGameHubStore,
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
import { setPersonalBingoCenter } from '@/lib/bingo-game';
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
  if (gameId === 'bingo') return first === 'center' && args.length >= 2;
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
  const parts = parseSpmt(body.message);
  if (!parts.length) return NextResponse.json({ handled: false });

  const channel = normalizeGameHubChannel(body.channel);
  const username = normalizeGameHubChannel(body.username);
  const displayName = String(body.displayName || username).trim().slice(0, 80) || username;
  const userId = body.userId;
  if (!channel || !username) return NextResponse.json({ handled: false });

  const command = parts[0].toLowerCase();

  // Chat Tag predates Games Hub and is a persistent ecosystem-wide game. Keep
  // its original root commands backward compatible so existing players never
  // need to rejoin or relearn commands just because Games Hub is installed.
  if (LEGACY_CHAT_TAG_ROOT_COMMANDS.has(command)) {
    return NextResponse.json({ handled: false, legacyChatTag: true });
  }

  if (command === 'help' || command === 'rules' || command === 'games') {
    const state = await readAppState();
    const activeIds = resolveChannelGameIds(state, channel);
    if (!activeIds.length) {
      return NextResponse.json({ handled: true, reply: `@${displayName} No Games Hub games are ACTIVE in #${channel}.` });
    }
    const segments = activeIds.map((gameId) => {
      const game = getGameHubGame(gameId);
      const spec = getCanonicalGameCommandSpec(gameId);
      return game ? `[${game.shortName}] spmt ${spec?.key || game.id}` : gameId;
    });
    const prefix = command === 'games'
      ? `@${displayName} Active in #${channel}:`
      : `@${displayName} Games Hub ${command} for #${channel}:`;
    return NextResponse.json({
      handled: true,
      reply: fitCompactReplyWithLink(prefix, segments, guideUrl(req, channel)),
    });
  }

  if (command === 'score') {
    const state = await readAppState();
    const activeIds = resolveChannelGameIds(state, channel);
    if (!activeIds.length) {
      return NextResponse.json({ handled: true, reply: `@${displayName} No Games Hub games are ACTIVE in #${channel}.` });
    }
    const snapshots = getPlayerGameSnapshots(state, activeIds, { userId, username });
    return NextResponse.json({
      handled: true,
      reply: fitCompactReplyWithLink(
        `@${displayName} Games Hub scores:`,
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
        `@${displayName} Games Hub profile: ${wallet}`,
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

  if (action === 'leave') {
    const playerId = normalizeGameHubPlayerId(userId, username);
    const left = await updateAppState((draft) => leaveGameHubGame(draft, playerId, game.id));
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

  const result = await updateAppState((draft) => joinGameHubGame(draft, {
    userId,
    username,
    displayName,
    gameId: game.id,
  }));

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
