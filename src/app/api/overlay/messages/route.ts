import { NextRequest, NextResponse } from 'next/server';
import { makeId, readAppState, updateAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

function normalizeChannel(channel: string): string {
  return String(channel || '').trim().toLowerCase().replace(/^#/, '');
}

function findPlayerIdByChannel(state: any, channel: string): string | null {
  const normalized = normalizeChannel(channel);
  if (!normalized) return null;

  for (const [id, player] of Object.entries(state.tagPlayers || {})) {
    const username = normalizeChannel((player as any).twitchUsername || (player as any).username || '');
    if (username === normalized) return id;
  }

  return null;
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const state = await readAppState();
  const messages = (state.overlayMessages?.[userId] || [])
    .slice()
    .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 20);

  return NextResponse.json({ messages, timestamp: Date.now() });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = String(body.message || '').trim();
    const channel = normalizeChannel(body.channel || '');

    if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });
    if (!body.userId && !channel) {
      return NextResponse.json({ error: 'userId or channel required' }, { status: 400 });
    }

    const result = await updateAppState((state) => {
      const userId = body.userId || findPlayerIdByChannel(state, channel);
      if (!userId) return { error: 'overlay player not found', status: 404 };

      state.overlayMessages = state.overlayMessages || {};
      const messages = state.overlayMessages[userId] || [];
      messages.push({
        id: makeId('overlay'),
        userId,
        channel,
        message,
        type: body.type || 'bot-message',
        timestamp: Date.now(),
      });
      state.overlayMessages[userId] = messages.slice(-50);

      return { success: true, userId };
    });

    if ((result as any).error) {
      return NextResponse.json(
        { error: (result as any).error },
        { status: (result as any).status || 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
