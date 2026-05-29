import { NextRequest, NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';
import { buildGameStatePayload } from '@/lib/chat-tag-discord';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-bot-secret') || req.nextUrl.searchParams.get('secret');
  if (secret !== (process.env.BOT_SECRET_KEY || '1234')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const state = await readAppState();
    return NextResponse.json(buildGameStatePayload(state));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
