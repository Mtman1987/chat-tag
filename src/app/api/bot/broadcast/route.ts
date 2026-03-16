import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { message, channel } = await req.json();
    
    const botUrl = process.env.BOT_URL || 'http://chat-tag-bot.internal:8091';
    
    const res = await fetch(`${botUrl}/broadcast`, {
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
