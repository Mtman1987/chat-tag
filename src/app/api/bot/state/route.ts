import { NextRequest, NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';
import { getBotSecret } from '@/lib/runtime-secrets';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-bot-secret') || req.nextUrl.searchParams.get('secret');
  if (secret !== getBotSecret()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const state = await readAppState();
    return NextResponse.json({
      supportTickets: state.supportTickets || {},
      botRuntime: state.botRuntime,
      playerCount: Object.keys(state.tagPlayers).length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
