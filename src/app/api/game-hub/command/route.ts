import { NextRequest, NextResponse } from 'next/server';
import { isBotRequest } from '@/lib/auth';
import { getGameHubGame } from '@/lib/game-hub-catalog';
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
import { readAppState, updateAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

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
  if (gameId === 'chaosmode') return /^(explode|glitch|portal|shake)$/.test(first) && args.length === 1;
  if (gameId === 'chatwars' || gameId === 'colorwars') return /^(red|blue|green|yellow)$/.test(first) && args.length === 1;
  if (gameId === 'dancingparade') return first === 'dance' && args.length === 1;
  if (gameId === 'emojitower') return first === 'drop' && args.length === 1;
  if (gameId === 'petrace') return /^(dog|cat|rabbit|turtle|hamster)$/.test(first) && args.length === 1;
  if (gameId === 'pixelbattle') return /^(red|blue|green|yellow|purple|orange|pink|white|black|cyan)$/.test(first) && /^\d{1,2}$/.test(args[1] || '') && /^\d{1,2}$/.test(args[2] || '') && args.length === 3;
  if (gameId === 'treasurehunt') return /^[a-h][1-8]$/i.test(first) && args.length === 1;
  return false;
}

function compactHelp(state: any, channel: string) {
  const activeIds = resolveChannelGameIds(state, channel);
  const games = activeIds.map((id) => getGameHubGame(id)).filter(Boolean);
  if (!games.length) return 'No Games Hub games are running in this channel.';
  const summaries = games.map((game) => {
    const spec = getCanonicalGameCommandSpec(game!.id);
    return `${game!.shortName}: spmt ${spec?.key || game!.id}`;
  });
  return `Active games — ${summaries.join(' · ')}`.slice(0, 380);
}

function publicOrigin(req: NextRequest) {
  return req.nextUrl.origin.replace(/\/$/, '');
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
  if (command === 'help' || command === 'rules' || command === 'games') {
    const state = await readAppState();
    const activeIds = resolveChannelGameIds(state, channel);
    const activeGames = activeIds.map((id) => getGameHubGame(id)).filter(Boolean);
    if (command === 'rules') {
      const url = `${publicOrigin(req)}/games/rules?channel=${encodeURIComponent(channel)}`;
      return NextResponse.json({ handled: true, reply: `@${displayName} Rules for the games running in #${channel}: ${url}` });
    }
    if (command === 'games') {
      const names = activeGames.map((game) => game!.name).join(', ') || 'none';
      return NextResponse.json({ handled: true, reply: `@${displayName} Games running here: ${names}.` });
    }
    const link = `${publicOrigin(req)}/games/help?channel=${encodeURIComponent(channel)}`;
    return NextResponse.json({ handled: true, reply: `@${displayName} ${compactHelp(state, channel)} · Full commands: ${link}`.slice(0, 480) });
  }

  if (command === 'points') {
    const state = await readAppState();
    const playerId = normalizeGameHubPlayerId(userId, username);
    const player = getGameHubStore(state).players[playerId];
    const balance = Number(player?.gamePointsBalance || 0);
    return NextResponse.json({ handled: true, reply: `@${displayName} Games Points: ${balance}. These are spendable Games Hub points and are separate from SPMT XP.` });
  }

  const spec = resolveGameHubCommandKey(command);
  if (!spec) return NextResponse.json({ handled: false });
  const game = getGameHubGame(spec.gameId);
  if (!game) return NextResponse.json({ handled: false });
  const actionArgs = parts.slice(1);
  const action = String(actionArgs[0] || '').toLowerCase();
  const canControl = Boolean(body.isBroadcaster || body.isModerator || body.isAdmin || username === channel);

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
      reply: `${game.name} is now ${action === 'start' ? 'RUNNING' : 'STOPPED'} in #${channel}.`,
      activeGameIds: activeIds,
    });
  }

  const state = await readAppState();
  const activeGameIds = resolveChannelGameIds(state, channel);
  if (!activeGameIds.includes(game.id)) {
    return NextResponse.json({ handled: true, reply: `@${displayName} ${game.name} is not running in #${channel}.` });
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
    return NextResponse.json({ handled: true, reply: `@${displayName} ${left ? `left ${game.name}.` : `was not joined to ${game.name}.`}` });
  }

  const result = await updateAppState((draft) => joinGameHubGame(draft, {
    userId,
    username,
    displayName,
    gameId: game.id,
  }));

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
