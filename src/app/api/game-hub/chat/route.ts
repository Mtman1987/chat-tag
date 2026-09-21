import { NextRequest, NextResponse } from 'next/server';
import { isBotRequest } from '@/lib/auth';
import { getBotSecret } from '@/lib/runtime-secrets';
import { getGameHubGame } from '@/lib/game-hub-registry';
import { appendNebulaChatEvent } from '@/lib/game-hub-event-bus';
import { recordChatWarsMessage } from '@/lib/chat-wars';
import {
  GAME_SCORE_INTERVAL_MS,
  getGameHubStore,
  normalizeGameHubPlayerId,
  recordPhraseGuessAttempt,
  recordWordChainMessage,
  recordGameHubChatActivity,
  resolveChannelGameIds,
} from '@/lib/game-hub-state';
import { readAppState, updateAppStateIfChanged, type JsonObject } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

const STREAMWEAVER_URL = String(
  process.env.STREAMWEAVER_URL || process.env.STREAMWEAVE_URL || 'https://streamweaver-new.fly.dev',
).replace(/\/$/, '');

async function queueStellaHalftime(halftime: any) {
  const counts = halftime?.counts || {};
  const ranked = ['red', 'blue', 'green', 'yellow'].sort((a, b) => Number(counts[b] || 0) - Number(counts[a] || 0));
  const leader = ranked[0];
  const trailer = ranked[ranked.length - 1];
  const text = `Halftime, space cadets! ${leader} team, enjoy the lead but do not get comfortable. ${trailer} team, the comeback engines are warming up. Everybody stretch your typing fingers; the second battlefield opens in one minute!`;
  try {
    const secret = getBotSecret();
    if (!secret) return false;
    const generated = await fetch(`${STREAMWEAVER_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': secret },
      body: JSON.stringify({ text, tenantId: 'spacemountainlive' }),
    });
    if (!generated.ok) return false;
    const body = await generated.json().catch(() => null) as any;
    const audioUrl = String(body?.audioDataUri || '');
    if (!audioUrl) return false;
    const queued = await fetch(`${STREAMWEAVER_URL}/api/tts/current?tenant=spacemountainlive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': secret },
      body: JSON.stringify({ audioUrl, text }),
    });
    return queued.ok;
  } catch (error) {
    console.warn('[ChatWars] Stella halftime failed', error);
    return false;
  }
}

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
    if (gameId === 'chatwars') return false;
    const lastScoreAt = Date.parse(String(snapshotPlayer?.joinedGames?.[gameId]?.lastScoreAt || 0));
    return !Number.isFinite(lastScoreAt) || now - lastScoreAt >= GAME_SCORE_INTERVAL_MS;
  });
  const phraseGuessAttemptDue = participatingGameIds.includes('phraseguess') && !/^\s*!?@?spmt\b/i.test(message);
  const wordChainAttemptDue = participatingGameIds.includes('wordchain') && !/^\s*!?@?spmt\b/i.test(message);
  const chatWarsAttemptDue = participatingGameIds.includes('chatwars') && !/^\s*!?@?spmt\b/i.test(message);
  const activity = scoreWriteDue || phraseGuessAttemptDue || wordChainAttemptDue || chatWarsAttemptDue
    ? await updateAppStateIfChanged((state) => {
      const result = recordGameHubChatActivity(state, {
        channel,
        userId: body.userId,
        username,
        displayName: cleanText(body.displayName || username, 80),
        message,
      });
      const phraseGuess = phraseGuessAttemptDue
        ? recordPhraseGuessAttempt(state, { channel, userId: body.userId, username, displayName: cleanText(body.displayName || username, 80), message })
        : { changed: false, outcome: 'ignored' as const };
      const wordChain = wordChainAttemptDue
        ? recordWordChainMessage(state, { channel, userId: body.userId, username, displayName: cleanText(body.displayName || username, 80), message })
        : { changed: false, outcome: 'ignored' as const };
      const chatWars = chatWarsAttemptDue
        ? recordChatWarsMessage(state, { channel, userId: body.userId, username, displayName: cleanText(body.displayName || username, 80), message })
        : { changed: false, outcome: 'ignored' as const };
      return {
        changed: result.scoredGameIds.length > 0 || result.pointsAwarded > 0 || phraseGuess.changed || wordChain.changed || chatWars.changed,
        result: { ...result, participatingGameIds, eventGameIds, phraseGuess, wordChain, chatWars },
      };
    })
    : { activeGameIds, participatingGameIds, eventGameIds, scoredGameIds: [], pointsAwarded: 0, phraseGuess: { changed: false, outcome: 'ignored' as const }, wordChain: { changed: false, outcome: 'ignored' as const }, chatWars: { changed: false, outcome: 'ignored' as const } };

  const stellaHalftimeQueued = activity.chatWars?.outcome === 'halftime-started'
    ? await queueStellaHalftime(activity.chatWars.halftime)
    : undefined;

  return NextResponse.json({
    accepted: true,
    id: baseEvent?.id || null,
    runtimeActionId: null,
    eventGameIds: activity.eventGameIds,
    scoredGameIds: activity.scoredGameIds,
    pointsAwarded: activity.pointsAwarded,
    phraseGuess: activity.phraseGuess,
    wordChain: activity.wordChain,
    chatWars: activity.chatWars,
    ...(stellaHalftimeQueued !== undefined ? { stellaHalftimeQueued } : {}),
  });
}
