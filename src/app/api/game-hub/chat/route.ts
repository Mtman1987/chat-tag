import { NextRequest, NextResponse } from 'next/server';
import { isBotRequest } from '@/lib/auth';
import { getGameHubGame } from '@/lib/game-hub-registry';
import { appendNebulaChatEvent } from '@/lib/game-hub-event-bus';
import {
  GAME_SCORE_INTERVAL_MS,
  getGameHubStore,
  normalizeGameHubPlayerId,
  recordGameHubChatActivity,
  resolveChannelGameIds,
} from '@/lib/game-hub-state';
import { readAppState, updateAppStateIfChanged, type JsonObject } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

function normalizeChannel(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/^#/, '').slice(0, 80);
}

function cleanText(value: unknown, max: number): string {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

export async function POST(req: NextRequest) {
  if (!isBotRequest(req)) {
    return NextResponse.json({ error: 'Bot service authentication required.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as JsonObject;
  const channel = normalizeChannel(body.channel);
  const username = normalizeChannel(body.username);
  const message = cleanText(body.message, 500);
  if (!channel || !username || !message) {
    return NextResponse.json({ error: 'channel, username and message are required.' }, { status: 400 });
  }

  // Avoid rewriting the entire volume-backed state for ordinary chat when the
  // channel has no running Games Hub game. Chat Tag activity is persisted by
  // its own route; this endpoint only needs to retain traffic for active games.
  const snapshot = await readAppState();
  const activeGameIds = resolveChannelGameIds(snapshot, channel);
  if (!activeGameIds.length) {
    return NextResponse.json({
      accepted: true,
      skipped: true,
      reason: 'no-active-games',
      runtimeActionId: null,
      eventGameIds: [],
      scoredGameIds: [],
      pointsAwarded: 0,
    });
  }

  const playerId = normalizeGameHubPlayerId(body.userId, username);
  const snapshotPlayer = getGameHubStore(snapshot).players[playerId];
  const participatingGameIds = activeGameIds.filter((gameId) => snapshotPlayer?.joinedGames?.[gameId]?.active === true);
  const passiveGameIds = activeGameIds.filter((gameId) => getGameHubGame(gameId)?.runtime === 'chat-reactive');
  const eventGameIds = [...new Set([...participatingGameIds, ...passiveGameIds])];
  const baseEvent = eventGameIds.length ? appendNebulaChatEvent({
    channel,
    username,
    userId: cleanText(body.userId, 80),
    displayName: cleanText(body.displayName || username, 80),
    message,
    color: cleanText(body.color, 32),
    badges: body.badges && typeof body.badges === 'object' ? body.badges : {},
    gameIds: eventGameIds,
  }) : null;

  const now = Date.now();
  const scoreWriteDue = participatingGameIds.some((gameId) => {
    const lastScoreAt = Date.parse(String(snapshotPlayer?.joinedGames?.[gameId]?.lastScoreAt || 0));
    return !Number.isFinite(lastScoreAt) || now - lastScoreAt >= GAME_SCORE_INTERVAL_MS;
  });
  const activity = scoreWriteDue
    ? await updateAppStateIfChanged((state) => {
      const result = recordGameHubChatActivity(state, {
        channel,
        userId: body.userId,
        username,
        displayName: cleanText(body.displayName || username, 80),
        message,
      });
      return {
        changed: result.scoredGameIds.length > 0 || result.pointsAwarded > 0,
        result: { ...result, participatingGameIds, eventGameIds },
      };
    })
    : { activeGameIds, participatingGameIds, eventGameIds, scoredGameIds: [], pointsAwarded: 0 };

  return NextResponse.json({
    accepted: true,
    id: baseEvent?.id || null,
    runtimeActionId: null,
    eventGameIds: activity.eventGameIds,
    scoredGameIds: activity.scoredGameIds,
    pointsAwarded: activity.pointsAwarded,
  });
}
