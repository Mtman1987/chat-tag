import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { personalBingoView, resolveBingoIdentity } from '@/lib/bingo-game';
import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = getSessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'SPMT authentication required.' }, { status: 401 });

  try {
    const state = await readAppState();
    const identity = resolveBingoIdentity(state, user);
    return NextResponse.json({ bingo: personalBingoView(state, identity) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to load your Bingo card.' }, { status: 500 });
  }
}
