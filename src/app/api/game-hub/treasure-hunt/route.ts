import { NextRequest, NextResponse } from 'next/server';
import { settleTreasureTurn, treasureHuntPublicSnapshot, treasureTurnAnnouncement } from '@/lib/treasure-hunt';
import { queueStellaSpeech } from '@/lib/stella-tts';
import { updateAppStateIfChanged } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const channel = String(req.nextUrl.searchParams.get('channel') || '').trim();
  if (!channel) return NextResponse.json({ error: 'channel is required.' }, { status: 400 });
  const result = await updateAppStateIfChanged((state) => {
    const settled = settleTreasureTurn(state, channel);
    return { changed: settled.changed, result: { snapshot: treasureHuntPublicSnapshot(state, channel), skipped: settled.skipped } };
  });
  if (result.skipped) void queueStellaSpeech(`${result.skipped.displayName} missed their turn. ${treasureTurnAnnouncement(result.snapshot)}`, channel);
  return NextResponse.json(result.snapshot, { headers: { 'Cache-Control': 'no-store' } });
}

