import { NextRequest, NextResponse } from 'next/server';
import { settleTreasureTurn, treasureHuntPublicSnapshot } from '@/lib/treasure-hunt';
import { updateAppStateIfChanged } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const channel = String(req.nextUrl.searchParams.get('channel') || '').trim();
  if (!channel) return NextResponse.json({ error: 'channel is required.' }, { status: 400 });
  const snapshot = await updateAppStateIfChanged((state) => {
    const settled = settleTreasureTurn(state, channel);
    return { changed: settled.changed, result: treasureHuntPublicSnapshot(state, channel) };
  });
  return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
}
