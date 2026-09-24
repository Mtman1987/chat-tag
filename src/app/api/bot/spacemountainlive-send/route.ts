import { NextRequest, NextResponse } from 'next/server';
import tmi from 'tmi.js';
import { isBotRequest } from '@/lib/auth';
import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

const SYSTEM_CHANNEL = 'spacemountainlive';

function normalizeToken(value: unknown): string {
  return String(value || '').trim().replace(/^oauth:/i, '');
}

export async function POST(req: NextRequest) {
  if (!isBotRequest(req)) {
    return NextResponse.json({ error: 'Bot service authentication required.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { message?: unknown };
  const message = String(body.message || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 480);
  if (!message) {
    return NextResponse.json({ error: 'message is required.' }, { status: 400 });
  }

  const username = String(process.env.TWITCH_BOT_USERNAME || '').trim().replace(/^@/, '').toLowerCase();
  if (username !== SYSTEM_CHANNEL) {
    return NextResponse.json({
      error: 'ChatTag broadcaster transport is not authenticated as spacemountainlive.',
    }, { status: 503 });
  }

  const state = await readAppState();
  const runtimeTokens = (state.botRuntime as any)?.tokens || {};
  const token = normalizeToken(runtimeTokens.TWITCH_BOT_TOKEN || process.env.TWITCH_BOT_TOKEN);
  if (!token) {
    return NextResponse.json({ error: 'ChatTag spacemountainlive token is unavailable.' }, { status: 503 });
  }

  const client = new tmi.Client({
    options: { debug: false },
    connection: { secure: true, reconnect: false },
    identity: { username: SYSTEM_CHANNEL, password: `oauth:${token}` },
    channels: [SYSTEM_CHANNEL],
  });

  try {
    await client.connect();
    await client.say(`#${SYSTEM_CHANNEL}`, message);
    return NextResponse.json({ success: true, channel: SYSTEM_CHANNEL, identity: SYSTEM_CHANNEL });
  } catch (error) {
    console.error('[ChatTag broadcaster bridge] send failed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 502 });
  } finally {
    try { await client.disconnect(); } catch {}
  }
}
