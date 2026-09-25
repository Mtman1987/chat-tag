import { NextRequest, NextResponse } from 'next/server';
import { isBotRequest } from '@/lib/auth';
import { getGameHubGame } from '@/lib/game-hub-registry';
import {
  canonicalJoinCommand,
  canonicalPlayerCommands,
  resolveDirectGameCommand,
  resolveGameHubCommandKey,
} from '@/lib/game-hub-commands';
import { getPublicAppOrigin } from '@/lib/public-origin';
import { recordGameHubRuntimeAction } from '@/lib/game-hub-runtime';
import { setGameHubInstructions } from '@/lib/game-hub-instructions';
import {
  joinGameHubGame,
  leaveGameHubGame,
  normalizeGameHubChannel,
  normalizeGameHubPlayerId,
  purchasePhraseGuessHint,
  resolveChannelGameIds,
  setChannelGameRunning,
  submitPhraseGuessPhrase,
  submitWordChainTheme,
} from '@/lib/game-hub-state';
import {
  allPlayedGameIds,
  compactGameSnapshot,
  fitCompactReplyWithLink,
  gamesPointsStandings,
  getGamesPointsStanding,
  getPlayerGameSnapshots,
} from '@/lib/game-hub-chat-summary';
import { readAppState, updateAppState } from '@/lib/volume-store';
import { lookupTwitchUser } from '@/lib/twitch';
import {
  MOSAIC_COLORS,
  MOSAIC_XP_COST,
  clearMosaicQueue,
  finishMosaicForPreview,
  mosaicPublicSnapshot,
  paintMosaicCell,
  parseMosaicBrushCommand,
  parseMosaicPaintCommand,
  parseMosaicViewCommand,
  queueMosaicTheme,
  removeMosaicQueueRequest,
  resetMosaicForReplay,
  resumeMosaicIfNeeded,
  setMosaicPalette,
  setMosaicBrush,
  setMosaicView,
  validateMosaicTheme,
} from '@/lib/nebula-mosaic';
import { awardSpmtXp } from '@/lib/spmt-client';
import { getNebulaChatEvents } from '@/lib/game-hub-event-bus';
import { nebulaRotationIndexAt } from '@/lib/nebula-rotation';
import { instantGameOverlayProfileId } from '@/lib/game-hub-overlays';
import { chatWarsMinimumWordLength, compactChatWarsReveal, getChatWarsPlayer, setChatWarsTeam } from '@/lib/chat-wars';
import { answerTreasureRiddle, buyTreasurePass, digTreasure, joinTreasureRotation, leaveTreasureRotation, voteKickTreasureTurn } from '@/lib/treasure-hunt';
import { buyBingoCenterFree, buyBingoStellaFlip, claimSharedBingoSquare, suggestSharedBingoPhrase } from '@/lib/shared-bingo';
import {
  addDancingParadeEmojis,
  addDancingParadeParticipant,
  extractParadeEmojis,
  getDancingParadeSnapshot,
  triggerDancingParadeDance,
} from '@/lib/dancing-parade';

export const dynamic = 'force-dynamic';

const LEGACY_CHAT_TAG_ROOT_COMMANDS = new Set(['help', 'rules', 'score']);
const ACTIVITY_GAME_ORDER = ['chatwars', 'pixelbattle', 'treasurehunt', 'bingo'];
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
    return (first === 'claim' && /^[a-e][1-5]$/i.test(args[1] || '') && args.length === 2)
      || (/^[a-e][1-5]$/i.test(first) && args.length >= 1)
      || (first === 'flip' && /^[a-e][1-5]$/i.test(args[1] || '') && args.length === 2)
      || (/^(?:free|center)$/.test(first) && args.length === 1)
      || (first === 'phrases' && args.length === 1);
  }
  if (gameId === 'chaosmode') return /^(explode|glitch|portal|shake)$/.test(first) && args.length === 1;
  if (gameId === 'chatwars') return /^(red|blue|green|yellow|show|view|reveal)$/.test(first) && args.length === 1;
  if (gameId === 'dancingparade') return first === 'dance' && args.length === 1;
  if (gameId === 'emojitower') return first === 'drop' && args.length === 1;
  if (gameId === 'petrace') return /^(dog|cat|rabbit|turtle|hamster)$/.test(first) && args.length === 1;
  if (gameId === 'phraseguess') {
    return (first === 'hint' && args.length === 1)
      || (first === 'submit' && args.length >= 3);
  }
  if (gameId === 'wordchain') return first === 'theme' && args.length >= 3;
  if (gameId === 'pixelbattle') return /^(red|blue|green|yellow|purple|orange|pink|white|black|cyan)$/.test(first) && /^\d{1,2}$/.test(args[1] || '') && /^\d{1,2}$/.test(args[2] || '') && args.length === 3;
  if (gameId === 'treasurehunt') return (/^[a-t](?:2[0-5]|1\d|[1-9])$/i.test(first) && args.length === 1)
    || (/^(?:answer|solve)$/.test(first) && args.length >= 2)
    || (/^(?:pass|join|kick|status)$/.test(first) && args.length === 1);
  return false;
}

function publicOrigin(req: NextRequest) {
  return getPublicAppOrigin(req).replace(/\/$/, '');
}

function guideUrl(req: NextRequest, channel: string) {
  return `${publicOrigin(req)}/games/rules?channel=${encodeURIComponent(channel)}`;
}

function gamePopoutUrl(req: NextRequest, channel: string, gameId: string) {
  return `${publicOrigin(req)}/games/${encodeURIComponent(gameId)}?channel=${encodeURIComponent(channel)}`;
}

function instantGameOverlayUrl(req: NextRequest, channel: string, gameId: string) {
  const profileId = instantGameOverlayProfileId(channel, gameId);
  return profileId ? `${publicOrigin(req)}/overlay/game-hub/${profileId}` : '';
}

function gameReplyWithPopout(req: NextRequest, channel: string, gameId: string, message: string) {
  return fitCompactReplyWithLink(message, [], gamePopoutUrl(req, channel, gameId));
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

  if (command === 'mosaic' && /^(?:finish|complete)$/.test(String(parts[1] || '').toLowerCase()) && parts.length === 2) {
    if (!canControl) {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} Only the streamer or a moderator can finish a Mosaic preview.`) });
    }
    try {
      const artwork = await updateAppState((draft) => {
        const completed = finishMosaicForPreview(draft, channel);
        recordGameHubRuntimeAction(draft, {
          channel, gameId: 'pixelbattle', actorId: userId, username, displayName,
          action: 'preview-complete', args: [completed.id], message: String(body.message || ''),
        });
        return completed;
      });
      return NextResponse.json({
        handled: true,
        reply: `@${displayName} completed and saved “${artwork.theme}” for preview. The overlay now shows the full Mosaic.`,
      });
    } catch (error: any) {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} ${error?.message || 'That Mosaic could not be completed.'}`) });
    }
  }

  if (command === 'mosaic' && parts[1]?.toLowerCase() === 'queue') {
    const snapshot = mosaicPublicSnapshot(directState, channel) as any;
    const items = Array.isArray(snapshot.queue) ? snapshot.queue : [];
    const summary = items.length ? items.slice(0, 8).map((item: any) => `#${item.position} ${item.theme} (${item.status})`).join(' · ') : 'Queue is empty.';
    return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} ${summary}`) });
  }

  if (command === 'mosaic' && /^(?:remove|drop|reject)$/.test(String(parts[1] || '').toLowerCase())) {
    if (!canControl) return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} Only the streamer or a moderator can remove Mosaic requests.`) });
    const selectorText = parts.slice(2).join(' ').trim();
    const selector = /^\d+$/.test(selectorText) ? Number(selectorText) : selectorText;
    if (!selectorText) return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} Use spmt mosaic remove 2 or spmt mosaic remove theme name.`) });
    try {
      const removed = await updateAppState((draft) => removeMosaicQueueRequest(draft, channel, selector));
      return NextResponse.json({ handled: true, reply: `@${displayName} removed “${removed.theme}” from the Mosaic queue.` });
    } catch (error: any) {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} ${error?.message || 'That Mosaic request could not be removed.'}`) });
    }
  }

  if (command === 'mosaic' && /^(?:clearqueue|clear-queue|queueclear)$/.test(String(parts[1] || '').toLowerCase())) {
    if (!canControl) return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} Only the streamer or a moderator can clear the Mosaic queue.`) });
    const count = await updateAppState((draft) => clearMosaicQueue(draft, channel));
    return NextResponse.json({ handled: true, reply: `@${displayName} cleared ${count} Mosaic queue item${count === 1 ? '' : 's'}.` });
  }

  if (command === 'mosaic' && parts[1]?.toLowerCase() === 'palette') {
    if (!canControl) return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} Only the streamer or a moderator can change the live Mosaic palette.`) });
    try {
      const artwork = await updateAppState((draft) => setMosaicPalette(draft, channel, parts[2] || 'classic'));
      return NextResponse.json({ handled: true, reply: `@${displayName} switched “${artwork.theme}” to the ${artwork.paletteId || 'classic'} palette.` });
    } catch (error: any) {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} ${error?.message || 'That palette is unavailable.'}`) });
    }
  }

  if (command === 'mosaic' && /^(?:replay|again|reset)$/.test(String(parts[1] || '').toLowerCase())) {
    if (!canControl) return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} Only the streamer or a moderator can reset a shared Mosaic.`) });
    try {
      const artwork = await updateAppState((draft) => resetMosaicForReplay(draft, channel));
      return NextResponse.json({ handled: true, reply: `@${displayName} reset “${artwork.theme}” for another run.` });
    } catch (error: any) {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} ${error?.message || 'That Mosaic could not be replayed.'}`) });
    }
  }

  if (command === 'mosaic' && parts.length > 1) {
    let theme = '';
    try {
      theme = validateMosaicTheme(parts.slice(1).join(' '));
    } catch (error: any) {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} ${error?.message || 'Choose a valid Mosaic theme.'}`) });
    }
    if (MOSAIC_XP_COST > 0 && !String(userId || '').trim()) {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} Link your Twitch identity before spending SPMT XP on a Mosaic theme.`) });
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
        return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} the ${MOSAIC_XP_COST.toLocaleString()} SPMT XP charge could not be completed, so nothing was queued.`) });
      }
    }
    try {
      const queued = await updateAppState((draft) => {
        setChannelGameRunning(draft, channel, 'pixelbattle', true);
        // A chat request also wakes the autosaved board. Core Mosaic startup
        // must not depend on opening the admin popout or re-toggling the game.
        resumeMosaicIfNeeded(draft, channel);
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
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} ${error?.message || 'That Mosaic could not be queued.'}`) });
    }
  }

  const mosaicView = parseMosaicViewCommand(body.message);
  if (mosaicView !== null) {
    if (!activeForDirectRouting.includes('pixelbattle')) {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} Nebula Mosaic is not ACTIVE in #${channel}.`) });
    }
    if (activeActivityGame && activeActivityGame !== 'pixelbattle') {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} Nebula Mosaic is waiting in the activity rotation; commands currently belong to ${getGameHubGame(activeActivityGame)?.name || 'the displayed game'}.`) });
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
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} ${error?.message || 'That Mosaic view is unavailable.'}`) });
    }
  }

  const mosaicPaint = parseMosaicPaintCommand(body.message);
  const mosaicBrush = parseMosaicBrushCommand(body.message);
  if (mosaicBrush !== null) {
    if (!activeForDirectRouting.includes('pixelbattle')) {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} Nebula Mosaic is not ACTIVE in #${channel}.`) });
    }
    if (activeActivityGame && activeActivityGame !== 'pixelbattle') {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} Nebula Mosaic is waiting in the activity rotation; brushes can be changed when it returns.`) });
    }
    try {
      const equipped = await updateAppState((draft) => setMosaicBrush(draft, {
        channel, userId, username, displayName, brush: mosaicBrush,
      }));
      return NextResponse.json({
        handled: true,
        reply: mosaicBrush === 'status'
          ? `@${displayName} your brush for “${equipped.artwork}” paints ${equipped.brush} cell${equipped.brush === 1 ? '' : 's'} to the right. Change it with spmt brush 1-5.`
          : `@${displayName} ${equipped.brush === 1 ? 'single-cell brush equipped' : `${equipped.brush}-cell brush equipped`} for “${equipped.artwork}”. Paint normally with commands like spmt d15y.`,
      });
    } catch (error: any) {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} ${error?.message || 'That Mosaic brush could not be equipped.'}`) });
    }
  }

  if (mosaicPaint) {
    if (!activeForDirectRouting.includes('pixelbattle')) {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} Nebula Mosaic is not ACTIVE in #${channel}.`) });
    }
    if (activeActivityGame && activeActivityGame !== 'pixelbattle') {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} that coordinate belongs to ${getGameHubGame(activeActivityGame)?.name || 'the displayed game'} right now. Nebula Mosaic will return in the rotation.`) });
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
        return NextResponse.json({ handled: true, reply: `@${displayName} your ${result.brush || 1}-cell brush found no new ${expectedName} cells starting at ${result.coordinate} on board ${result.board}.` });
      }
      const bonus = result.milestones.reduce((sum, milestone) => sum + milestone.bonus, 0);
      const paintedRange = result.paintedCoordinates.length > 1
        ? `${result.paintedCoordinates[0]}–${result.paintedCoordinates.at(-1)}`
        : result.paintedCoordinates[0];
      return NextResponse.json({
        handled: true,
        reply: `@${displayName} painted board ${result.board} ${paintedRange} ${expectedName} · +${result.paintedCount}${result.stoppedAt ? ` · stopped before ${result.stoppedAt}` : ''}${bonus ? ` · milestone bonuses +${bonus}` : ''} · score ${result.score}.`,
        mosaicMilestones: result.milestones,
      });
    } catch (error: any) {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, 'pixelbattle', `@${displayName} ${error?.message || 'That square could not be painted.'}`) });
    }
  }

  if (command === 'instructions') {
    if (!canControl) {
      return NextResponse.json({
        handled: true,
        reply: fitCompactReplyWithLink(
          `@${displayName} Only the streamer or a moderator can change the instruction overlay.`,
          [],
          guideUrl(req, channel),
        ),
      });
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

  if (/^(?:control|controls|popout)$/.test(command)) {
    const requested = resolveGameHubCommandKey(parts[1]);
    const fallbackId = activeActivityGame
      || activeForDirectRouting.find((gameId) => gameId !== 'chat-tag')
      || activeForDirectRouting[0];
    const game = requested ? getGameHubGame(requested.gameId) : getGameHubGame(fallbackId);
    if (!game) {
      return NextResponse.json({
        handled: true,
        reply: `@${displayName} Name a game after spmt controls, or browse the active-game guide: ${guideUrl(req, channel)}`.slice(0, 480),
      });
    }
    const url = gamePopoutUrl(req, channel, game.id);
    return NextResponse.json({
      handled: true,
      reply: `@${displayName} open ${game.name} to learn by playing, see its rules and commands, and use streamer controls: ${url}`.slice(0, 480),
      launchUrl: url,
    });
  }

  // Player-facing Nebula Arcade commands are short ("spmt explode",
  // "spmt pet dog", "spmt dig B5"). Namespaced forms remain an internal
  // compatibility transport so old links and bot rewrites keep working.
  const direct = resolveDirectGameCommand(parts, activeForDirectRouting);
  if (direct.recognized) {
    if (!direct.intents.length) {
      return NextResponse.json({
        handled: true,
        reply: fitCompactReplyWithLink(
          `@${displayName} That Nebula Arcade game is not ACTIVE in #${channel}.`,
          [],
          guideUrl(req, channel),
        ),
      });
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
      return NextResponse.json({
        handled: true,
        reply: fitCompactReplyWithLink(
          `@${displayName} No Nebula Arcade games are ACTIVE in #${channel}.`,
          [],
          guideUrl(req, channel),
        ),
      });
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
      return NextResponse.json({
        handled: true,
        reply: fitCompactReplyWithLink(
          `@${displayName} No Nebula Arcade games are ACTIVE in #${channel}.`,
          [],
          guideUrl(req, channel),
        ),
      });
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
        reply: fitCompactReplyWithLink(
          `@${displayName} ${game.name}:`,
          canonicalPlayerCommands(game).map((item) => item.trigger),
          gamePopoutUrl(req, channel, game.id),
        ),
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
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, game.id, `@${displayName} Only the streamer or a moderator can ${action} ${game.name}.`) });
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
    const url = gamePopoutUrl(req, channel, game.id);
    const overlayUrl = instantGameOverlayUrl(req, channel, game.id);
    return NextResponse.json({
      handled: true,
      reply: action === 'start'
        ? `${game.name} is ACTIVE in #${channel}. Open to play or watch: ${url} · Streamer: copy into an OBS Browser Source: ${overlayUrl}`.slice(0, 480)
        : `${game.name} is now STOPPED in #${channel}.`,
      activeGameIds: activeIds,
      ...(action === 'start' ? { launchUrl: url, overlayUrl } : {}),
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
    return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, game.id, `@${displayName} ${game.name} is not ACTIVE in #${channel}.`) });
  }

  if (game.id === 'chatwars' && /^(?:show|view|reveal)$/.test(action)) {
    return NextResponse.json({
      handled: true,
      reply: `@${displayName} showing the full Chat Wars battlefield and standings for 15 seconds.`,
      overlayEvent: {
        type: 'chat-wars-reveal',
        message: 'Chat Wars battlefield',
        payload: compactChatWarsReveal(state, channel),
      },
    });
  }

  if (game.id === 'chatwars' && /^(?:red|blue|green|yellow)$/.test(action)) {
    const enlistment = await updateAppState((draft) => {
      const result = setChatWarsTeam(draft, { channel, userId, username, displayName, team: action });
      recordGameHubRuntimeAction(draft, {
        channel, gameId: game.id, actorId: userId, username, displayName,
        action: 'team', args: [action], message: String(body.message || ''),
      });
      return result;
    });
    return NextResponse.json({
      handled: true,
      reply: enlistment.locked
        ? `@${displayName} you are already fighting for ${enlistment.team} in this Chat Wars campaign · level ${enlistment.level}.`
        : `@${displayName} joined ${enlistment.team} for Chat Wars! Talk normally to claim territory · level ${enlistment.level}.`,
    });
  }

  if (game.id === 'chatwars' && !actionArgs.length) {
    const player = getChatWarsPlayer(state, { channel, userId, username });
    return NextResponse.json({
      handled: true,
      reply: player
        ? `@${displayName} fights for ${player.team} · level ${player.level}. Keep talking normally; words of ${chatWarsMinimumWordLength(player.level)}+ letters currently count.`
        : `@${displayName} choose a Chat Wars team with spmt red, spmt blue, spmt green, or spmt yellow.`,
    });
  }

  if (/^(?:help|rules|control|controls|popout)$/.test(action)) {
    const url = gamePopoutUrl(req, channel, game.id);
    return NextResponse.json({
      handled: true,
      reply: fitCompactReplyWithLink(`@${displayName} ${game.name}:`, canonicalPlayerCommands(game).map((item) => item.trigger), url),
      launchUrl: url,
    });
  }

  if (!knownAction(game.id, actionArgs)) {
    return NextResponse.json({
      handled: true,
      reply: fitCompactReplyWithLink(`@${displayName} ${game.name}:`, canonicalPlayerCommands(game).map((item) => item.trigger), gamePopoutUrl(req, channel, game.id)),
    });
  }

  if (game.id === 'treasurehunt') {
    if (!action || action === 'join') {
      const result = await updateAppState((draft) => {
        const joined = joinTreasureRotation(draft, { channel, userId, username, displayName });
        if (joined.changed) recordGameHubRuntimeAction(draft, { channel, gameId: game.id, actorId: userId, username, displayName, action: 'join', args: [], message: String(body.message || '') });
        return joined;
      });
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, game.id, `@${displayName} ${result.alreadyJoined ? `is already #${result.position}` : `joined at #${result.position}`} in the Treasure Hunt turn rotation${result.current ? ` · ${result.current.displayName} is up now` : ''}.`) });
    }
    if (action === 'leave') {
      const result = await updateAppState((draft) => {
        const left = leaveTreasureRotation(draft, { channel, userId, username });
        leaveGameHubGame(draft, normalizeGameHubPlayerId(userId, username), game.id);
        return left;
      });
      return NextResponse.json({ handled: true, reply: `@${displayName} ${result.left ? 'left the Treasure Hunt rotation' : 'was not in the Treasure Hunt rotation'}${result.current ? ` · ${result.current.displayName} is up now` : ''}.` });
    }
    if (action === 'status') {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, game.id, `@${displayName} open the live board for the current turn, queue, riddle, and standings.`) });
    }
    if (action === 'kick') {
      const result = await updateAppState((draft) => voteKickTreasureTurn(draft, { channel, userId, username }));
      if (result.outcome === 'voted') return NextResponse.json({ handled: true, reply: `@${displayName} voted to skip the absent boiling-turn player · ${result.votes}/${result.needed}.` });
      if (result.outcome === 'kicked') return NextResponse.json({ handled: true, reply: `Vote passed: ${result.kicked?.displayName || 'the absent player'} was removed from this rotation · ${result.current?.displayName || 'nobody'} is up now.` });
      if (result.outcome === 'already-voted') return NextResponse.json({ handled: true, reply: `@${displayName} your vote is already counted.` });
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, game.id, `@${displayName} vote-kick is available to joined players only while an unresolved boiling treasure turn is blocking the rotation.`) });
    }
    if (/^(?:answer|solve)$/.test(action)) {
      const answer = rawActionArgs.slice(1).join(' ');
      const result = await updateAppState((draft) => {
        const solved = answerTreasureRiddle(draft, { channel, answer, userId, username, displayName });
        if (solved.changed) recordGameHubRuntimeAction(draft, { channel, gameId: game.id, actorId: userId, username, displayName, action: 'answer', args: [answer], message: String(body.message || '') });
        return solved;
      });
      if (result.outcome === 'no-challenge') return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, game.id, `@${displayName} there is no active riddle. Pick a square with spmt dig B5.`) });
      if (result.outcome === 'not-turn') return NextResponse.json({ handled: true, reply: `@${displayName} it is ${result.current?.displayName || 'the next player'}’s turn. Discuss the riddle in chat, but only the active player can lock in an answer.` });
      if (result.outcome === 'wrong') return NextResponse.json({ handled: true, reply: `@${displayName} that is not it · -${result.deduction} Games Points${result.changedRiddle ? ` · three misses, so Stella changed the riddle: ${result.question}` : ` · ${3 - result.wrongGuesses} guesses remain before the riddle changes`}.` });
      return NextResponse.json({ handled: true, reply: `@${displayName} solved it! +${result.solvePoints} Games Points${result.digPoints ? ` · the digger earned +${result.digPoints}` : ''}${result.treasureCoordinate ? ` · TREASURE unearthed at ${result.treasureCoordinate} (${result.foundCount}/3)` : ''}${result.complete ? ' — BOARD COMPLETE!' : ''}.` });
    }
    if (action === 'pass') {
      const result = await updateAppState((draft) => {
        const purchase = buyTreasurePass(draft, { channel, userId, username, displayName });
        if (purchase.changed) recordGameHubRuntimeAction(draft, { channel, gameId: game.id, actorId: userId, username, displayName, action: 'pass', args: [], message: String(body.message || '') });
        return purchase;
      });
      if (result.outcome === 'purchased') return NextResponse.json({ handled: true, reply: `@${displayName} bought a Treasure Pass for ${result.cost} Games Points: there is an unfound treasure at ${result.coordinate} · ${result.remaining} passes remain this board.` });
      if (result.outcome === 'insufficient') return NextResponse.json({ handled: true, reply: `@${displayName} a Treasure Pass costs 250 Games Points; you have ${result.balance}.` });
      if (result.outcome === 'limit') return NextResponse.json({ handled: true, reply: `@${displayName} you already used the five-pass maximum for this board.` });
      if (result.outcome === 'nothing-new') return NextResponse.json({ handled: true, reply: `@${displayName} every remaining treasure location has already been revealed to you.` });
      return NextResponse.json({ handled: true, reply: `@${displayName} this board is already complete.` });
    }
    const result = await updateAppState((draft) => {
      const dig = digTreasure(draft, { channel, coordinate: action, userId, username, displayName });
      if (dig.changed) recordGameHubRuntimeAction(draft, {
        channel, gameId: game.id, actorId: userId, username, displayName,
        action: 'dig', args: [action], message: String(body.message || ''),
      });
      return dig;
    });
    if (result.outcome === 'invalid') return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, game.id, `@${displayName} choose A1 through T25, for example spmt dig B5.`) });
    if (result.outcome === 'not-turn') return NextResponse.json({ handled: true, reply: `@${displayName} joined at #${result.position}; ${result.current?.displayName || 'the next player'} chooses the current square.` });
    if (result.outcome === 'already-dug') return NextResponse.json({ handled: true, reply: `@${displayName} ${result.coordinate} was already dug · ${result.dig?.clue}.` });
    if (result.outcome === 'challenge-active') return NextResponse.json({ handled: true, reply: `@${displayName} finish the active ${result.challenge?.clue.toUpperCase()} riddle at ${result.challenge?.coordinate} first: ${result.challenge?.question} · answer with spmt treasure answer your answer.` });
    if (result.outcome === 'complete') return NextResponse.json({ handled: true, reply: `@${displayName} today’s Treasure Hunt is complete. A fresh map opens tomorrow.` });
    return NextResponse.json({ handled: true, reply: `@${displayName} chose ${result.coordinate}: ${result.clue?.toUpperCase()}${result.digPoints ? ` · +${result.digPoints} Games Point` : ' · locked until solved'} · RIDDLE: ${result.question} · answer with spmt treasure answer your answer.` });
  }

  if (game.id === 'bingo' && action === 'phrases') {
    return NextResponse.json({
      handled: true,
      reply: gameReplyWithPopout(req, channel, game.id, `@${displayName} Open the player card to see the phrases. The stream board hides them so the streamer cannot cheat.`),
    });
  }

  if (game.id === 'bingo') {
    if (!action) {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, game.id, `@${displayName} open the shared player card to see phrases; claim a triggered square with spmt bingo B4.`), launchUrl: gamePopoutUrl(req, channel, game.id) });
    }
    if (action === 'flip') {
      const result = await updateAppState((draft) => {
        const flip = buyBingoStellaFlip(draft, { channel, coordinate: actionArgs[1], userId, username, displayName });
        if (flip.changed) recordGameHubRuntimeAction(draft, { channel, gameId: game.id, actorId: userId, username, displayName, action: 'flip', args: [actionArgs[1]], message: String(body.message || '') });
        return flip;
      });
      if (result.outcome === 'flipped') return NextResponse.json({ handled: true, reply: `@${displayName} spent ${result.cost} Games Points and flipped ${result.coordinate} from Stella to chat${result.won ? ' — BINGO!' : ''}.` });
      if (result.outcome === 'insufficient') return NextResponse.json({ handled: true, reply: `@${displayName} flipping a Stella square costs ${result.cost} Games Points; you have ${result.balance}.` });
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, game.id, `@${displayName} that square is not currently owned by Stella.`) });
    }
    if (action === 'free' || action === 'center') {
      const result = await updateAppState((draft) => {
        const free = buyBingoCenterFree(draft, { channel, userId, username, displayName });
        if (free.changed) recordGameHubRuntimeAction(draft, { channel, gameId: game.id, actorId: userId, username, displayName, action: 'free', args: ['C3'], message: String(body.message || '') });
        return free;
      });
      if (result.outcome === 'freed') return NextResponse.json({ handled: true, reply: `@${displayName} spent ${result.cost} Games Points and made center square C3 a permanent chat free space${result.won ? ' — BINGO!' : ''}.` });
      if (result.outcome === 'insufficient') return NextResponse.json({ handled: true, reply: `@${displayName} the center free space costs ${result.cost} Games Points; you have ${result.balance}.` });
      return NextResponse.json({ handled: true, reply: `@${displayName} center square C3 already belongs to chat or the card is complete.` });
    }
    const coordinate = action === 'claim' ? actionArgs[1] : action;
    const phrase = action === 'claim' ? '' : rawActionArgs.slice(1).join(' ').trim();
    if (phrase) {
      const result = await updateAppState((draft) => {
        const suggestion = suggestSharedBingoPhrase(draft, { channel, coordinate, phrase, userId, username, displayName });
        if (suggestion.changed) recordGameHubRuntimeAction(draft, {
          channel, gameId: game.id, actorId: userId, username, displayName,
          action: 'replace', args: [String(coordinate), phrase], message: String(body.message || ''),
        });
        return suggestion;
      });
      if (result.outcome === 'suggested') return NextResponse.json({ handled: true, reply: `@${displayName} spent ${result.cost} Games Points and changed ${result.coordinate} to “${result.phrase}”. Get the streamer to say it, then claim ${result.coordinate}.` });
      if (result.outcome === 'insufficient') return NextResponse.json({ handled: true, reply: `@${displayName} changing a Bingo phrase costs ${result.cost} Games Points; you have ${result.balance}.` });
      if (result.outcome === 'inappropriate') return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, game.id, `@${displayName} keep replacement phrases short and stream-appropriate.`) });
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, game.id, `@${displayName} that square is already pending or owned by chat. Open, replacement, and Stella squares can be changed.`) });
    }
    const result = await updateAppState((draft) => {
      const claim = claimSharedBingoSquare(draft, { channel, coordinate, userId, username, displayName });
      if (claim.changed && claim.outcome === 'claimed') recordGameHubRuntimeAction(draft, {
        channel, gameId: game.id, actorId: userId, username, displayName,
        action: 'claim', args: [String(coordinate)], message: String(body.message || ''),
      });
      return claim;
    });
    if (result.outcome === 'claimed') return NextResponse.json({ handled: true, reply: `@${displayName} claimed ${result.coordinate} for chat · +${result.points} Games Points${result.won ? ' — BINGO! The streamer and every participant earned bonuses.' : ''}` });
    if (result.outcome === 'blocked') return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, game.id, `@${displayName} Stella protected that square. Change its phrase with spmt bingo ${String(coordinate).toUpperCase()} new phrase, or buy it back with spmt bingo flip ${String(coordinate).toUpperCase()}.`) });
    if (result.outcome === 'complete') return NextResponse.json({ handled: true, reply: `@${displayName} this shared Bingo card is already complete.` });
    return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, game.id, `@${displayName} ${String(coordinate).toUpperCase()} is not ready to claim. Wait for the streamer to say its phrase, then type spmt bingo ${String(coordinate).toUpperCase()}.`) });
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
    const message = `@${displayName} ${left ? `left ${game.name}.` : `was not joined to ${game.name}.`}`;
    return NextResponse.json({
      handled: true,
      reply: left ? message : gameReplyWithPopout(req, channel, game.id, message),
    });
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
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, game.id, `@${displayName} ${error?.message || 'That hint could not be unlocked.'}`) });
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
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, game.id, `@${displayName} ${error?.message || 'That phrase could not be submitted.'}`) });
    }
  }

  if (game.id === 'wordchain' && action === 'theme') {
    const rawTheme = rawActionArgs.slice(1).join(' ');
    const separator = rawTheme.indexOf(':');
    if (separator < 1) {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, game.id, `@${displayName} use: spmt chain theme Space: rocket, planet, comet, telescope`) });
    }
    const name = rawTheme.slice(0, separator).trim();
    const words = rawTheme.slice(separator + 1).trim();
    try {
      const submission = await updateAppState((draft) => {
        joinGameHubGame(draft, { userId, username, displayName, gameId: game.id });
        const added = submitWordChainTheme(draft, { channel, userId, username, displayName, name, words });
        recordGameHubRuntimeAction(draft, {
          channel, gameId: game.id, actorId: userId, username, displayName,
          action: 'theme', args: [added.entry.name, ...added.entry.words], message: String(body.message || ''),
        });
        return added;
      });
      return NextResponse.json({
        handled: true,
        reply: `@${displayName} added Word Chain theme “${submission.entry.name}” with ${submission.entry.words.length} starter words · ${submission.inventorySize} community theme${submission.inventorySize === 1 ? '' : 's'} available.`,
      });
    } catch (error: any) {
      return NextResponse.json({ handled: true, reply: gameReplyWithPopout(req, channel, game.id, `@${displayName} ${error?.message || 'That theme could not be submitted.'}`) });
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
    const url = gamePopoutUrl(req, channel, game.id);
    return NextResponse.json({
      handled: true,
      reply: `@${displayName} ${result.alreadyJoined ? `you are already playing ${game.name}.` : `joined ${game.name}!`} Learn and play: ${url}`.slice(0, 480),
      launchUrl: url,
    });
  }

  return NextResponse.json({
    handled: true,
    reply: result.alreadyJoined
      ? `@${displayName} ${game.shortName}: ${actionArgs.join(' ')} registered.`
      : `@${displayName} joined ${game.name} · ${actionArgs.join(' ')} registered.`,
  });
}
