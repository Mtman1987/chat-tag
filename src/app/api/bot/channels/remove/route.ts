import { NextRequest, NextResponse } from 'next/server';
import { updateAppState } from '@/lib/volume-store';

export async function POST(req: NextRequest) {
  try {
    const { channel } = await req.json();
    const sanitized = String(channel || '').toLowerCase().replace(/^#/, '');

    await updateAppState((state) => {
      delete state.botChannels[sanitized];

      for (const [id, player] of Object.entries(state.tagPlayers)) {
        const username = String((player as any).twitchUsername || '').toLowerCase();
        if (username === sanitized) {
          delete state.tagPlayers[id];
        }
      }
    });

    try {
      const botUrl = process.env.BOT_URL || 'http://chat-tag-bot.internal:8091';
      await fetch(`${botUrl}/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'community-update' }),
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
