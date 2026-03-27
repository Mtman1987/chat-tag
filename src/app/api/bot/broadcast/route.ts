import { NextRequest, NextResponse } from 'next/server';

const BOT_URL = process.env.BOT_URL || 'https://chat-tag-bot.fly.dev';

export async function POST(req: NextRequest) {
  try {
    const { message, channel } = await req.json();

    const res = await fetch(`${BOT_URL}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, channel })
    });
    
    if (!res.ok) {
      throw new Error('Bot broadcast failed');
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
