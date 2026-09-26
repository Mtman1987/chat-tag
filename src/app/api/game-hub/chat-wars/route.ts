import { NextRequest, NextResponse } from 'next/server';
import { chatWarsPublicSnapshot, chatWarsStreamBattleSnapshot } from '@/lib/chat-wars';
import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const channel = String(req.nextUrl.searchParams.get('channel') || '').trim();
  if (!channel) return NextResponse.json({ error: 'channel is required.' }, { status: 400 });
  const state = await readAppState();
  const snapshot = chatWarsPublicSnapshot(state, channel);
  const battle = chatWarsStreamBattleSnapshot(state, channel);
  return NextResponse.json({ ...snapshot, battle }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
