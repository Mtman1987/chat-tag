import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Crown lookups must never block outbound Twitch or Discord announcements.
// Return quickly; the bot will use its existing cached winner list when available.
export async function GET() {
  return NextResponse.json({ monthlyWinners: [] });
}
