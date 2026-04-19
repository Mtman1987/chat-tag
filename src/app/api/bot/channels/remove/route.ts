import { NextRequest, NextResponse } from 'next/server';
import { makeId, updateAppState } from '@/lib/volume-store';

const BOT_URL = process.env.BOT_URL || 'https://chat-tag-bot-new.fly.dev';

export async function POST(req: NextRequest) {
  try {
    const { channel } = await req.json();
    const sanitized = String(channel || '').toLowerCase().replace(/^#/, '');

    await updateAppState((state) => {
      // Remove bot channel entry
      delete state.botChannels[sanitized];

      // Remove matching player from the game (single source of truth)
      for (const [id, player] of Object.entries(state.tagPlayers)) {
        const username = String((player as any).twitchUsername || '').toLowerCase();
        if (username === sanitized) {
          const wasIt = (player as any).isIt || state.tagGame?.state?.currentIt === id;

          delete state.tagPlayers[id];

          // If they were "it", go free-for-all
          if (wasIt && state.tagGame?.state) {
            state.tagGame.state.currentIt = null;
            state.tagGame.state.lastTagTime = Date.now();
          }

          state.adminHistory = state.adminHistory || [];
          state.adminHistory.push({
            id: makeId('admin'),
            action: 'removed',
            performedBy: 'admin',
            details: `${sanitized} removed from game`,
            timestamp: Date.now(),
          });
          break;
        }
      }
    });

    try {
      await fetch(`${BOT_URL}/broadcast`, {
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
