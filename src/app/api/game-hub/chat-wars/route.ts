import { NextRequest, NextResponse } from 'next/server';
import { chatWarsPublicSnapshot } from '@/lib/chat-wars';
import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const channel = String(req.nextUrl.searchParams.get('channel') || '').trim();
  if (!channel) return NextResponse.json({ error: 'channel is required.' }, { status: 400 });
  const state = await readAppState();
  return NextResponse.json(chatWarsPublicSnapshot(state, channel), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
