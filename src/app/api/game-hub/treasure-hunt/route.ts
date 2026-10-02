import { NextRequest, NextResponse } from 'next/server';
import { settleTreasureTurn, treasureHuntPublicSnapshot, treasureTurnAnnouncement } from '@/lib/treasure-hunt';
import { resolveChannelGameIds } from '@/lib/game-hub-state';
import { queueStellaSpeech } from '@/lib/stella-tts';
import { readAppState, updateAppStateIfChanged } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const channel = String(req.nextUrl.searchParams.get('channel') || '').trim();
  if (!channel) return NextResponse.json({ error: 'channel is required.' }, { status: 400 });
  // Ordinary overlay polling must not queue behind gameplay writes or clone
  // the entire app state. Only an expired turn needs the mutation lock.
  const current = await readAppState();
  const snapshot = treasureHuntPublicSnapshot(current, channel);
  const turnDue = !snapshot.complete && snapshot.turn.current && snapshot.turn.expiresAt
    && !(Date.parse(snapshot.turn.expiresAt) > Date.now());
  if (!resolveChannelGameIds(current, channel).includes('treasurehunt') || !turnDue) {
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
  }
  const result = await updateAppStateIfChanged((state) => {
    const settled = resolveChannelGameIds(state, channel).includes('treasurehunt')
      ? settleTreasureTurn(state, channel) : { changed: false, skipped: null };
    return { changed: settled.changed, result: { snapshot: treasureHuntPublicSnapshot(state, channel), skipped: settled.skipped } };
  });
  if (result.skipped) void queueStellaSpeech(`${result.skipped.displayName} missed their turn. ${treasureTurnAnnouncement(result.snapshot)}`, channel);
  return NextResponse.json(result.snapshot, { headers: { 'Cache-Control': 'no-store' } });
}
