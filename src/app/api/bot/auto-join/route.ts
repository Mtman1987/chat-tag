import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { liveUsernames } = await req.json();
    
    // Forward to bot process (assumes bot is running)
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/bot/join-channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channels: liveUsernames })
    });
    
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to auto-join' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
