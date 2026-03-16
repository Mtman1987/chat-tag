import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { message, channel } = await req.json();

    const botUrl = process.env.BOT_URL || 'http://chat-tag-bot.internal:8091';

    const res = await fetch(`${botUrl}/broadcast-source`, {
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
