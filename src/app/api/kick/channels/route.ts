import { NextRequest, NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';
import { getStreamweaverSecret } from '@/lib/runtime-secrets';

export const dynamic = 'force-dynamic';

/**
 * GET /api/kick/channels?secret=xxx
 * Returns list of Kick usernames that streamweaver should join.
 * Only includes players who have linked a kickUsername.
 */
export async function GET(req: NextRequest) {
  const STREAMWEAVER_SECRET = getStreamweaverSecret();
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== STREAMWEAVER_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const state = await readAppState();
  const channels: string[] = [];

  for (const player of Object.values(state.tagPlayers) as any[]) {
    if (player.kickUsername) {
      channels.push(player.kickUsername.toLowerCase());
    }
  }

  return NextResponse.json({ channels });
}
