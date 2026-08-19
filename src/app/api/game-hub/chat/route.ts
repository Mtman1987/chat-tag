import { NextRequest, NextResponse } from 'next/server';
import { isBotRequest } from '@/lib/auth';
import { resolveGameHubCommandKey } from '@/lib/game-hub-commands';
import {
  getGameHubStore,
  normalizeGameHubPlayerId,
  recordGameHubChatActivity,
} from '@/lib/game-hub-state';
import { makeId, updateAppState, type JsonObject } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

const STORE_KEY = 'gameHubChatEvents';
const MAX_EVENTS_PER_CHANNEL = 250;
const MAX_EVENT_AGE_MS = 10 * 60 * 1000;

function normalizeChannel(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/^#/, '').slice(0, 80);
}

function cleanText(value: unknown, max: number): string {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function targetedGameId(message: string): string | null {
  const match = message.trim().match(/^!?@?spmt(?:\s+|$)(.*)$/i);
  if (!match) return null;
  const key = String(match[1] || '').trim().split(/\s+/).filter(Boolean)[0];
  return resolveGameHubCommandKey(key)?.gameId || null;
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

  const baseEvent = {
    id: makeId('game_chat'),
    at: new Date().toISOString(),
    channel,
    username,
    userId: cleanText(body.userId, 80),
    displayName: cleanText(body.displayName || username, 80),
    message,
    color: cleanText(body.color, 32),
    badges: body.badges && typeof body.badges === 'object' ? body.badges : {},
  };

  const activity = await updateAppState((state) => {
    const result = recordGameHubChatActivity(state, {
      channel,
      userId: body.userId,
      username,
      displayName: baseEvent.displayName,
      message,
    });

    const playerId = normalizeGameHubPlayerId(body.userId, username);
    const player = getGameHubStore(state).players[playerId];
    const participatingGameIds = result.activeGameIds.filter((gameId) => player?.joinedGames?.[gameId]?.active === true);
    const commandGameId = targetedGameId(message);
    const gameIds = commandGameId
      ? (result.activeGameIds.includes(commandGameId) ? [commandGameId] : [])
      : participatingGameIds;

    state.gameSettings.default ||= {};
    const store = (state.gameSettings.default[STORE_KEY] ||= {}) as Record<string, JsonObject[]>;
    const cutoff = Date.now() - MAX_EVENT_AGE_MS;
    const current = Array.isArray(store[channel]) ? store[channel] : [];
    current.push({ ...baseEvent, gameIds });
    store[channel] = current
      .filter((item) => Date.parse(String(item?.at || '')) >= cutoff)
      .slice(-MAX_EVENTS_PER_CHANNEL);

    return { ...result, participatingGameIds, eventGameIds: gameIds };
  });

  return NextResponse.json({
    accepted: true,
    id: baseEvent.id,
    eventGameIds: activity.eventGameIds,
    scoredGameIds: activity.scoredGameIds,
    pointsAwarded: activity.pointsAwarded,
  });
}
