import { NextRequest, NextResponse } from 'next/server';
import { isBotRequest } from '@/lib/auth';
import { getBotSecret } from '@/lib/runtime-secrets';
import { awardSpmtXp, grandfatherSpmtIdentity, publishSpmtEvent } from '@/lib/spmt-client';
import { buildXpIdempotencyKey } from '@spmt/sdk';
import { lookupTwitchUser } from '@/lib/twitch';
import { readAppState, updateAppState } from '@/lib/volume-store';
import { setChannelGameRunning } from '@/lib/game-hub-state';
import {
  finishDueDancingParades,
  getDancingParadeSnapshot,
  startDancingParade,
  type DancingParadeParticipant,
  type DancingParadeSession,
} from '@/lib/dancing-parade';

export const dynamic = 'force-dynamic';

const STREAMWEAVER_URL = String(
  process.env.STREAMWEAVER_URL
  || process.env.STREAMWEAVE_URL
  || 'https://streamweaver-new.fly.dev',
).replace(/\/$/, '');

const STELLA_INTRO = 'Look out for the cosmic conga line — it’s a dance party! Type S P M T join to join the dance, S P M T plus any emoji to add it to the parade, and S P M T dance to make the whole crew do the seismic wiggle!';

function normalizeChannel(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^#/, '').slice(0, 80);
}

async function queueStellaIntro() {
  try {
    const secret = getBotSecret();
    if (!secret) return false;
    const tts = await fetch(`${STREAMWEAVER_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': secret },
      body: JSON.stringify({ text: STELLA_INTRO, tenantId: 'spacemountainlive' }),
    });
    if (!tts.ok) return false;
    const ttsBody = await tts.json().catch(() => null) as any;
    const audioUrl = String(ttsBody?.audioDataUri || '');
    if (!audioUrl) return false;
    const queued = await fetch(`${STREAMWEAVER_URL}/api/tts/current?tenant=spacemountainlive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': secret },
      body: JSON.stringify({ audioUrl, text: STELLA_INTRO }),
    });
    return queued.ok;
  } catch (error) {
    console.warn('[DancingParade] Stella intro failed', error);
    return false;
  }
}

async function resolveSpmtParticipant(participant: DancingParadeParticipant) {
  let twitchId = String(participant.userId || '').replace(/^user_/, '').trim();
  let username = normalizeChannel(participant.username);
  if (!/^\d+$/.test(twitchId) && username) {
    const twitch = await lookupTwitchUser(username).catch(() => null);
    if (twitch?.id) twitchId = twitch.id;
    if (twitch?.login) username = twitch.login;
  }
  if (!/^\d+$/.test(twitchId) || !username) return null;
  const identity = await grandfatherSpmtIdentity({
    twitchId,
    twitchUsername: username,
    displayName: participant.displayName || username,
    issueSession: false,
  });
  const spmtUserId = identity?.user?.id;
  return spmtUserId ? { spmtUserId, twitchId, username } : null;
}

async function awardParadeXp(session: DancingParadeSession) {
  const participants = session.participantOrder
    .map((username) => session.participants[username])
    .filter(Boolean);
  let awarded = 0;
  for (const participant of participants) {
    const resolved = await resolveSpmtParticipant(participant).catch(() => null);
    if (!resolved) continue;
    const upstreamEventId = `${session.id}:${resolved.twitchId}`;
    const result = await awardSpmtXp({
      userId: resolved.spmtUserId,
      sourceApp: 'chat-tag',
      eventType: 'dancing-parade-participation',
      idempotencyKey: buildXpIdempotencyKey({
        sourceApp: 'chat-tag',
        eventType: 'dancing-parade-participation',
        upstreamEventId,
        userId: resolved.spmtUserId,
      }),
      delta: 100,
      metadata: {
        upstreamEventId,
        sessionId: session.id,
        channel: session.channel,
        twitchId: resolved.twitchId,
        twitchUsername: resolved.username,
        trigger: session.trigger,
      },
    });
    if (result?.ok) awarded += 1;
  }
  return {
    names: participants.map((participant) => participant.displayName || participant.username),
    count: participants.length,
    awarded,
  };
}

export async function GET(req: NextRequest) {
  const channel = normalizeChannel(req.nextUrl.searchParams.get('channel'));
  if (!channel) return NextResponse.json({ error: 'channel is required' }, { status: 400 });
  const state = await readAppState();
  return NextResponse.json(getDancingParadeSnapshot(state, channel), {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}

export async function POST(req: NextRequest) {
  if (!isBotRequest(req)) {
    return NextResponse.json({ error: 'Bot service authentication required.' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({})) as any;
  const action = String(body?.action || '').trim().toLowerCase();

  if (action === 'start') {
    const channel = normalizeChannel(body?.channel);
    if (!channel) return NextResponse.json({ error: 'channel is required' }, { status: 400 });

    const result = await updateAppState((state) => {
      const started = startDancingParade(state, {
        channel,
        trigger: body?.trigger,
        triggerUser: body?.triggerUser,
      });
      if (started.started) setChannelGameRunning(state, channel, 'dancingparade', true);
      return started;
    });

    if (!result.started) {
      return NextResponse.json(result, { status: result.reason === 'redeem-cooldown' ? 429 : 200 });
    }

    void publishSpmtEvent({
      type: 'dancing-parade.started',
      visibility: 'community',
      payload: {
        summary: `Dance party started in #${channel}`,
        channel,
        sessionId: result.session.id,
        trigger: result.session.trigger,
        triggerUser: result.session.triggerUser,
      },
    });
    const stellaQueued = await queueStellaIntro();
    return NextResponse.json({ ...result, stellaQueued });
  }

  if (action === 'finish-due') {
    const sessions = await updateAppState((state) => {
      const ended = finishDueDancingParades(state);
      for (const session of ended) setChannelGameRunning(state, session.channel, 'dancingparade', false);
      return ended;
    });
    const ended = [];
    for (const session of sessions) {
      const xp = await awardParadeXp(session);
      void publishSpmtEvent({
        type: 'dancing-parade.completed',
        visibility: 'community',
        payload: {
          summary: `Dance party finished in #${session.channel}`,
          channel: session.channel,
          sessionId: session.id,
          participantCount: xp.count,
          xpAwardedCount: xp.awarded,
        },
      });
      ended.push({
        channel: session.channel,
        sessionId: session.id,
        participantNames: xp.names,
        participantCount: xp.count,
        xpAwardedCount: xp.awarded,
      });
    }
    return NextResponse.json({ ended });
  }

  return NextResponse.json({ error: 'Unsupported parade action.' }, { status: 400 });
}
