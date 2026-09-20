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
import { setGameHubInstructions } from '@/lib/game-hub-instructions';
import {
  awardGameHubPoints,
  joinGameHubGame,
  leaveGameHubGame,
  normalizeGameHubChannel,
  normalizeGameHubPlayerId,
  purchasePhraseGuessHint,
  resolveChannelGameIds,
  setChannelGameRunning,
  submitPhraseGuessPhrase,
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
import { lookupTwitchUser } from '@/lib/twitch';
import {
  MOSAIC_COLORS,
  MOSAIC_XP_COST,
  mosaicPublicSnapshot,
  paintMosaicCell,
  parseMosaicPaintCommand,
  parseMosaicViewCommand,
  queueMosaicTheme,
  resumeMosaicIfNeeded,
  setMosaicView,
  validateMosaicTheme,
} from '@/lib/nebula-mosaic';
import { awardSpmtXp } from '@/lib/spmt-client';
import { getNebulaChatEvents } from '@/lib/game-hub-event-bus';
import { nebulaRotationIndexAt } from '@/lib/nebula-rotation';
import {
  addDancingParadeEmojis,
  addDancingParadeParticipant,
  extractParadeEmojis,
  getDancingParadeSnapshot,
  triggerDancingParadeDance,
} from '@/lib/dancing-parade';

export const dynamic = 'force-dynamic';

const LEGACY_CHAT_TAG_ROOT_COMMANDS = new Set(['help', 'rules', 'score']);
const ACTIVITY_GAME_ORDER = ['chatwars', 'colorwars', 'memorylane', 'pixelbattle', 'treasurehunt', 'bingo'];
const ACTIVITY_RECENT_MS = 30 * 60_000;

function currentActivityGameId(state: any, channel: string, activeGameIds: string[], now = Date.now()) {
  const recent = new Set(getNebulaChatEvents(channel, '', 250).flatMap((event: any) => {
    const at = Date.parse(String(event?.at || ''));
    return Number.isFinite(at) && now - at <= ACTIVITY_RECENT_MS && Array.isArray(event?.gameIds) ? event.gameIds : [];
  }));
  const mosaic = mosaicPublicSnapshot(state, channel).artwork;
  const available = ACTIVITY_GAME_ORDER.filter((gameId) => activeGameIds.includes(gameId)
    && (recent.has(gameId) || (gameId === 'pixelbattle' && mosaic?.status === 'active')));
  return available.length ? available[nebulaRotationIndexAt(now, available.length)] : null;
}

function parseSpmt(message: unknown): string[] {
  const raw = String(message || '').trim();
  const mosaic = raw.match(/^!mosaic(?:\s+|$)(.*)$/i);
  if (mosaic) return ['mosaic', ...String(mosaic[1] || '').trim().split(/\s+/).filter(Boolean)];
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
  if (gameId === 'phraseguess') {
    return (first === 'hint' && args.length === 1)
      || (first === 'submit' && args.length >= 3);
  }
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

function quackversePlayUrl(req: NextRequest, channel: string) {
  const query = new URLSearchParams({ tenant: channel, roomId: channel });
  return `${publicOrigin(req)}/quackverse?${query.toString()}`;
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
  const directState = await readAppState();
  const activeForDirectRouting = resolveChannelGameIds(directState, channel);
  const activeActivityGame = currentActivityGameId(directState, channel, activeForDirectRouting);
  const canControl = Boolean(body.isBroadcaster || body.isModerator || body.isAdmin || username === channel);

  if (command === 'mosaic' && parts.length > 1) {
    let theme = '';
    try {
      theme = validateMosaicTheme(parts.slice(1).join(' '));
    } catch (error: any) {
      return NextResponse.json({ handled: true, reply: `@${displayName} ${error?.message || 'Choose a valid Mosaic theme.'}` });
    }
    if (MOSAIC_XP_COST > 0 && !String(userId || '').trim()) {
      return NextResponse.json({ handled: true, reply: `@${displayName} Link your Twitch identity before spending SPMT XP on a Mosaic theme.` });
    }
    const mosaicRequestKey = `mosaic:${channel}:${String(body.messageId || body.eventId || Date.now())}:${String(userId)}`;
    if (MOSAIC_XP_COST > 0) {
      const charge = await awardSpmtXp({
        userId: String(userId),
        eventType: 'nebula.mosaic.request',
        idempotencyKey: mosaicRequestKey,
        delta: -MOSAIC_XP_COST,
        metadata: { channel, theme },
      });
      if (charge.skipped || charge.ok !== true) {
        return NextResponse.json({ handled: true, reply: `@${displayName} the ${MOSAIC_XP_COST.toLocaleString()} SPMT XP charge could not be completed, so nothing was queued.` });
      }
    }
    try {
      const queued = await updateAppState((draft) => {
        setChannelGameRunning(draft, channel, 'pixelbattle', true);
        const result = queueMosaicTheme(draft, { channel, userId, username, displayName, theme, xpCost: MOSAIC_XP_COST });
        recordGameHubRuntimeAction(draft, {
          channel, gameId: 'pixelbattle', actorId: userId, username, displayName,
          action: 'theme', args: [theme], message: String(body.message || ''),
        });
        return result;
      });
      return NextResponse.json({
        handled: true,
        reply: `@${displayName} “${theme}” is Mosaic request #${queued.position}${MOSAIC_XP_COST ? ` · ${MOSAIC_XP_COST.toLocaleString()} SPMT XP spent` : ''}.`,
        mosaicGenerationQueued: true,
      });
    } catch (error: any) {
      if (MOSAIC_XP_COST > 0) {
        await awardSpmtXp({
          userId: String(userId),
          eventType: 'nebula.mosaic.refund',
          idempotencyKey: `${mosaicRequestKey}:refund`,
          delta: MOSAIC_XP_COST,
          metadata: { channel, theme, reason: 'queue-rejected' },
        }).catch(() => null);
      }
      return NextResponse.json({ handled: true, reply: `@${displayName} ${error?.message || 'That Mosaic could not be queued.'}` });
    }
  }

  const mosaicView = parseMosaicViewCommand(body.message);
  if (mosaicView !== null) {
    if (!activeForDirectRouting.includes('pixelbattle')) {
      return NextResponse.json({ handled: true, reply: `@${displayName} Nebula Mosaic is not ACTIVE in #${channel}.` });
    }
    if (activeActivityGame && activeActivityGame !== 'pixelbattle') {
      return NextResponse.json({ handled: true, reply: `@${displayName} Nebula Mosaic is waiting in the activity rotation; commands currently belong to ${getGameHubGame(activeActivityGame)?.name || 'the displayed game'}.` });
    }
    try {
      await updateAppState((draft) => {
        const artwork = setMosaicView(draft, channel, mosaicView);
        recordGameHubRuntimeAction(draft, {
          channel, gameId: 'pixelbattle', actorId: userId, username, displayName,
          action: 'view', args: [String(mosaicView)], message: String(body.message || ''),
        });
        return artwork;
      });
      return NextResponse.json({ handled: true, reply: mosaicView === 'all'
        ? `@${displayName} showing the complete Mosaic for 15 seconds.`
        : `@${displayName} opened Mosaic board ${mosaicView}.` });
    } catch (error: any) {
      return NextResponse.json({ handled: true, reply: `@${displayName} ${error?.message || 'That Mosaic view is unavailable.'}` });
    }
  }

  const mosaicPaint = parseMosaicPaintCommand(body.message);
  if (mosaicPaint) {
    if (!activeForDirectRouting.includes('pixelbattle')) {
      return NextResponse.json({ handled: true, reply: `@${displayName} Nebula Mosaic is not ACTIVE in #${channel}.` });
    }
    if (activeActivityGame && activeActivityGame !== 'pixelbattle') {
      return NextResponse.json({ handled: true, reply: `@${displayName} that coordinate belongs to ${getGameHubGame(activeActivityGame)?.name || 'the displayed game'} right now. Nebula Mosaic will return in the rotation.` });
    }
    try {
      const result = await updateAppState((draft) => {
        const painted = paintMosaicCell(draft, { channel, userId, username, displayName, command: mosaicPaint });
        recordGameHubRuntimeAction(draft, {
          channel, gameId: 'pixelbattle', actorId: userId, username, displayName,
          action: 'paint', args: [mosaicPaint.coordinate, mosaicPaint.color], message: String(body.message || ''),
        });
        return painted;
      });
      const expectedName = MOSAIC_COLORS[result.expected].name;
      if (result.outcome === 'wrong') {
        return NextResponse.json({ handled: true, reply: `@${displayName} ${result.coordinate} needs ${expectedName} · −1 point · score ${result.score}.` });
      }
      if (result.outcome === 'already-painted') {
        return NextResponse.json({ handled: true, reply: `@${displayName} ${result.coordinate} on board ${result.board} is already ${expectedName}.` });
      }
      const bonus = result.milestones.reduce((sum, milestone) => sum + milestone.bonus, 0);
      return NextResponse.json({
        handled: true,
        reply: `@${displayName} painted board ${result.board} ${result.coordinate} ${expectedName} · +1${bonus ? ` · milestone bonuses +${bonus}` : ''} · score ${result.score}.`,
        mosaicMilestones: result.milestones,
      });
    } catch (error: any) {
      return NextResponse.json({ handled: true, reply: `@${displayName} ${error?.message || 'That square could not be painted.'}` });
    }
  }

  if (command === 'instructions') {
    if (!canControl) {
      return NextResponse.json({ handled: true, reply: `@${displayName} Only the streamer or a moderator can change the instruction overlay.` });
    }
    const requested = String(parts[1] || '').trim().toLowerCase();
    if (/^(hide|off|clear)$/.test(requested)) {
      await updateAppState((state) => setGameHubInstructions(state, channel, null));
      return NextResponse.json({ handled: true, reply: `Nebula Arcade instructions are now hidden.` });
    }

    let spec = requested ? resolveGameHubCommandKey(requested) : null;
    if (!spec && !requested && activeForDirectRouting.length === 1) {
      spec = resolveGameHubCommandKey(activeForDirectRouting[0]);
    }
    if (!spec) {
      const choices = activeForDirectRouting.map((gameId) => {
        const activeSpec = resolveGameHubCommandKey(gameId);
        return activeSpec ? `spmt instructions ${activeSpec.key}` : '';
      }).filter(Boolean);
      return NextResponse.json({
        handled: true,
        reply: `@${displayName} Choose an ACTIVE game: ${choices.join(' · ') || 'none are active'}.`.slice(0, 480),
      });
    }

    const instructionGame = getGameHubGame(spec.gameId)!;
    await updateAppState((state) => setGameHubInstructions(state, channel, instructionGame.id));
    return NextResponse.json({ handled: true, reply: `${instructionGame.name} instructions are now visible on the instruction overlay.` });
  }

  const paradeSnapshot = getDancingParadeSnapshot(directState, channel);
  if (paradeSnapshot.active) {
    const emojiSource = command === 'join' || command === 'dance' || command === 'leave'
      ? ''
      : [parts[0], ...parts.slice(1)].join(' ');
    const paradeEmojis = extractParadeEmojis(emojiSource);
    if (command === 'join' || command === 'dance' || paradeEmojis.length) {
      let avatarUrl = '';
      if (command === 'join') {
        const twitch = await lookupTwitchUser(username).catch(() => null);
        avatarUrl = twitch?.profile_image_url || '';
      }
      await updateAppState((draft) => {
        const participant = addDancingParadeParticipant(draft, {
          channel,
          userId,
          username,
          displayName,
          avatarUrl,
          joinedAvatar: command === 'join',
        });
        if (paradeEmojis.length) addDancingParadeEmojis(draft, { channel, emojis: paradeEmojis });
        if (command === 'dance') triggerDancingParadeDance(draft, channel);
        return participant;
      });
      if (command === 'join') {
        return NextResponse.json({ handled: true, reply: `@${displayName} joined the cosmic conga line!` });
      }
      if (command === 'dance') {
        return NextResponse.json({ handled: true, reply: `@${displayName} triggered the seismic wiggle!` });
      }
      if (paradeEmojis.length) {
        return NextResponse.json({ handled: true, reply: `@${displayName} added ${paradeEmojis.join(' ')} to the dance party!` });
      }
    }
  }

  // Player-facing Nebula Arcade commands are short ("spmt explode",
  // "spmt pet dog", "spmt dig B5"). Namespaced forms remain an internal
  // compatibility transport so old links and bot rewrites keep working.
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
      return NextResponse.json({
        handled: true,
        reply: `@${displayName} No Games Points have been recorded yet.`,
        overlayEvent: {
          type: 'leaderboard-card',
          message: 'Nebula Arcade leaderboard',
          payload: { rows: [{ rank: '-', username: 'No ranked players yet', score: 0 }] },
        },
      });
    }
    const segments = leaders.map((entry) => `#${entry.rank} ${entry.displayName || entry.username} ${entry.balance.toLocaleString()}`);
    return NextResponse.json({
      handled: true,
      reply: fitCompactReplyWithLink(
        `@${displayName} Games Points leaders:`,
        segments,
        pointsLeaderboardUrl(req),
      ),
      overlayEvent: {
        type: 'leaderboard-card',
        message: 'Nebula Arcade leaderboard',
        payload: {
          rows: leaders.map((entry) => ({
            rank: entry.rank,
            username: entry.displayName || entry.username,
            score: entry.balance,
          })),
        },
      },
    });
  }

  const spec = resolveGameHubCommandKey(command);
  if (!spec) return NextResponse.json({ handled: false });
  const game = getGameHubGame(spec.gameId);
  if (!game) return NextResponse.json({ handled: false });
  const rawActionArgs = parts.slice(1);
  const actionArgs = rawActionArgs.map((part) => part.toLowerCase());
  const action = String(actionArgs[0] || '').toLowerCase();

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

    // Quackverse is a two-player browser game, not a persistent stream stage.
    // Starting it publishes the shared room URL while explicitly keeping it off
    // the Games Hub overlay. Packs remain a separate event overlay.
    if (game.id === 'quackverse' && action === 'start') {
      const activeIds = await updateAppState((state) => {
        setChannelGameRunning(state, channel, game.id, false);
        return resolveChannelGameIds(state, channel);
      });
      return NextResponse.json({
        handled: true,
        reply: `🦆 Quackverse is ready! Play, open packs, build decks, and manage your collection here: ${quackversePlayUrl(req, channel)}`.slice(0, 480),
        activeGameIds: activeIds,
        launchUrl: quackversePlayUrl(req, channel),
        overlayMode: 'pack-only',
      });
    }

    const activeIds = await updateAppState((state) => {
      setChannelGameRunning(state, channel, game.id, action === 'start');
      if (game.id === 'pixelbattle' && action === 'start') resumeMosaicIfNeeded(state, channel);
      if (action === 'stop') setGameHubInstructions(state, channel, null);
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

  if (game.id === 'quackverse' && !actionArgs.length) {
    return NextResponse.json({
      handled: true,
      reply: `🦆 @${displayName} Quackverse plays in a browser popout: ${quackversePlayUrl(req, channel)}`.slice(0, 480),
      launchUrl: quackversePlayUrl(req, channel),
      overlayMode: 'pack-only',
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

  if (game.id === 'phraseguess' && action === 'hint') {
    try {
      const purchase = await updateAppState((draft) => {
        joinGameHubGame(draft, { userId, username, displayName, gameId: game.id });
        const result = purchasePhraseGuessHint(draft, { channel, userId, username, displayName });
        recordGameHubRuntimeAction(draft, {
          channel, gameId: game.id, actorId: userId, username, displayName,
          action: 'hint', args: [], message: String(body.message || ''),
        });
        return result;
      });
      return NextResponse.json({
        handled: true,
        reply: `@${displayName} unlocked Phrase Guess hint ${purchase.tier}/3 for ${purchase.cost} Games Points · ${purchase.balance} remaining.`,
      });
    } catch (error: any) {
      return NextResponse.json({ handled: true, reply: `@${displayName} ${error?.message || 'That hint could not be unlocked.'}` });
    }
  }

  if (game.id === 'phraseguess' && action === 'submit') {
    const phrase = rawActionArgs.slice(1).join(' ');
    try {
      const submission = await updateAppState((draft) => {
        joinGameHubGame(draft, { userId, username, displayName, gameId: game.id });
        return submitPhraseGuessPhrase(draft, { channel, userId, username, displayName, phrase });
      });
      return NextResponse.json({
        handled: true,
        reply: `@${displayName} added “${submission.entry.phrase}” to Phrase Guess · ${submission.inventorySize} community phrase${submission.inventorySize === 1 ? '' : 's'} available. You earn 5 Games Points when it is solved.`,
      });
    } catch (error: any) {
      return NextResponse.json({ handled: true, reply: `@${displayName} ${error?.message || 'That phrase could not be submitted.'}` });
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
