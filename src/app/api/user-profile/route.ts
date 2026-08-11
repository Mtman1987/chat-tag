import { NextRequest, NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';
import { verifySessionToken } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    const spmtUserId = String(req.headers.get('x-spmt-user-id') || '').trim();
    if (spmtUserId) {
      const isAdmin = req.headers.get('x-spmt-is-admin') === '1';
      return NextResponse.json({
        spmt: true,
        isAdmin,
        role: isAdmin ? 'owner' : 'member',
        twitch: {
          id: spmtUserId,
          name: decodeURIComponent(req.headers.get('x-spmt-display-name') || 'SPMT user'),
          avatar: decodeURIComponent(req.headers.get('x-spmt-avatar-url') || ''),
        },
      });
    }

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
      isAdmin: false,
      role: 'member',
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
