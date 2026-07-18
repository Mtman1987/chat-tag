import { NextRequest, NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';
import { getBotSecret, getStreamweaverSecret } from '@/lib/runtime-secrets';

export const dynamic = 'force-dynamic';

const STREAMWEAVER_API = process.env.STREAMWEAVER_API_BASE || 'https://streamweaver-new.fly.dev';
const RETRYABLE_STREAMWEAVER_STATUSES = new Set([502, 503, 504, 522, 524]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastResponse: Response | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await fetch(url, init);
    lastResponse = response;
    if (response.ok) return response;

    await response.clone().text().catch(() => '');
    if (!RETRYABLE_STREAMWEAVER_STATUSES.has(response.status) || attempt === attempts) {
      return response;
    }

    await sleep(250 * attempt);
  }

  return lastResponse ?? new Response('', { status: 503 });
}

/**
 * POST /api/kick/broadcast
 * Sends a message to all linked Kick channels via Streamweaver.
 * Body: { message, channel? (optional, specific channel), secret }
 */
export async function POST(req: NextRequest) {
  const STREAMWEAVER_SECRET = getStreamweaverSecret();
  const BOT_SECRET = getBotSecret();
  try {
    const rawBody = await req.text();
    let body: any = {};
    if (rawBody.trim()) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        const cleaned = rawBody.replace(/[\u0000-\u001F\u007F]/g, '');
        try {
          body = JSON.parse(cleaned);
        } catch (parseError) {
          console.warn('[Kick Broadcast] Invalid JSON payload from caller:', {
            preview: rawBody.slice(0, 500),
            error: parseError instanceof Error ? parseError.message : String(parseError),
          });
          return NextResponse.json({ error: 'invalid JSON payload' }, { status: 400 });
        }
      }
    }
    const { message, channel, secret } = body;

    if (secret !== BOT_SECRET) {
      const botSecret = req.headers.get('x-bot-secret');
      if (botSecret !== BOT_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    if (!message) {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    // If a specific channel is given, send only there
    // Otherwise get all linked Kick channels and broadcast
    let channels: string[] = [];
    if (channel) {
      channels = [channel];
    } else {
      const state = await readAppState();
      for (const player of Object.values(state.tagPlayers) as any[]) {
        if (player.kickUsername) {
          channels.push(player.kickUsername.toLowerCase());
        }
      }
    }

    if (channels.length === 0) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    if (!STREAMWEAVER_API) {
      console.warn('[Kick Broadcast] Skipped: STREAMWEAVER_API_BASE is not configured');
      return NextResponse.json({ success: true, sent: 0, skipped: true, reason: 'STREAMWEAVER_API_BASE is not configured' });
    }

    // Forward to Streamweaver's Kick send endpoint. Kick delivery is best-effort so
    // Streamweaver outages do not make the chat-tag broadcast look like a Discord failure.
    try {
      const res = await postWithRetry(`${STREAMWEAVER_API}/api/kick/chat-tag-broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${STREAMWEAVER_SECRET}`,
          'x-bot-secret': STREAMWEAVER_SECRET,
        },
        body: JSON.stringify({ message, channels, secret: STREAMWEAVER_SECRET }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[Kick Broadcast] Streamweaver delivery failed (${res.status}): ${errText.slice(0, 200)}`);
        return NextResponse.json({ success: false, sent: 0, attempted: channels.length, error: 'Streamweaver delivery failed' });
      }

      return NextResponse.json({ success: true, sent: channels.length });
    } catch (error: any) {
      console.warn(`[Kick Broadcast] Streamweaver unavailable: ${error?.cause?.code || error?.code || error?.message || 'unknown error'}`);
      return NextResponse.json({ success: false, sent: 0, attempted: channels.length, error: 'Streamweaver unavailable' });
    }
  } catch (error: any) {
    console.error('[Kick Broadcast] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
