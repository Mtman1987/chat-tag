import { NextRequest, NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

const STREAMWEAVER_API = process.env.STREAMWEAVER_API_BASE || 'https://streamweaver-main.fly.dev';
const STREAMWEAVER_SECRET = process.env.STREAMWEAVER_SECRET || process.env.BOT_SECRET_KEY || '1234';

/**
 * POST /api/kick/broadcast
 * Sends a message to all linked Kick channels via Streamweaver.
 * Body: { message, channel? (optional, specific channel), secret }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, channel, secret } = body;

    if (secret !== STREAMWEAVER_SECRET) {
      // Also accept bot secret from internal calls
      const botSecret = req.headers.get('x-bot-secret');
      if (botSecret !== STREAMWEAVER_SECRET) {
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

    // Forward to Streamweaver's Kick send endpoint
    const res = await fetch(`${STREAMWEAVER_API}/api/kick/chat-tag-broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, channels, secret: STREAMWEAVER_SECRET }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Kick Broadcast] Streamweaver returned ${res.status}: ${errText}`);
      return NextResponse.json({ success: false, error: 'Streamweaver delivery failed' }, { status: 502 });
    }

    return NextResponse.json({ success: true, sent: channels.length });
  } catch (error: any) {
    console.error('[Kick Broadcast] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
