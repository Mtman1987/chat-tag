import { NextRequest, NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';
import { verifySessionToken } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cookieToken = req.cookies.get('session')?.value;
    const token = authHeader?.replace('Bearer ', '') || cookieToken;

    if (!token) {
      return NextResponse.json({});
    }

    const session = verifySessionToken(token);
    if (!session) {
      return NextResponse.json({});
    }

    const state = await readAppState();
    const user = state.users[session.id];

    return NextResponse.json({
      twitch: {
        id: session.id,
        name: user?.twitchUsername || session.twitchUsername,
        avatar: user?.avatarUrl || session.avatarUrl,
      },
    });
  } catch {
    return NextResponse.json({});
  }
}
