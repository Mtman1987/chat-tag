import { NextRequest, NextResponse } from 'next/server';

const BOT_URL = process.env.BOT_URL || 'https://chat-tag-bot.fly.dev';

export async function POST(req: NextRequest) {
  try {
    const { message, channel } = await req.json();

    const res = await fetch(`${BOT_URL}/broadcast-source`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, channel }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: payload?.reason || payload?.error || 'Bot source broadcast failed' },
        { status: res.status }
      );
    }

    return NextResponse.json({ success: true, ...payload });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
