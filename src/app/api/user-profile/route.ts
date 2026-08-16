import { NextRequest, NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';
import { createSessionToken, verifySessionToken } from '@/lib/session';
import { findLegacyTwitchUserRecord } from '@/lib/quackverse-identity';

export async function GET(req: NextRequest) {
  try {
    const spmtUserId = String(req.headers.get('x-spmt-user-id') || '').trim();
    if (spmtUserId) {
      const isAdmin = req.headers.get('x-spmt-is-admin') === '1';
      const displayName = decodeURIComponent(req.headers.get('x-spmt-display-name') || 'SPMT user');
      const avatarUrl = decodeURIComponent(req.headers.get('x-spmt-avatar-url') || '');
      const state = await readAppState();
      const direct = /^\d+$/.test(spmtUserId) ? state.users[spmtUserId] : null;
      const linked = direct
        ? {
            id: String(direct.id || spmtUserId),
            twitchUsername: String(direct.twitchUsername || displayName),
            avatarUrl: String(direct.avatarUrl || avatarUrl),
          }
        : findLegacyTwitchUserRecord(state.users, displayName);

      const response = NextResponse.json({
        spmt: true,
        isAdmin,
        role: isAdmin ? 'owner' : 'member',
        twitch: {
          id: linked?.id || spmtUserId,
          name: linked?.twitchUsername || displayName,
          avatar: linked?.avatarUrl || avatarUrl,
        },
      });

      // Preserve ChatTag's historical Twitch-keyed app identity in a signed,
      // HttpOnly session while SPMT remains the authentication authority.
      // Middleware accepts this ID only when the Twitch username matches the
      // authenticated SPMT identity, preventing cross-account collection swaps.
      if (linked?.id && /^\d+$/.test(linked.id)) {
        response.cookies.set('session', createSessionToken({
          id: linked.id,
          twitchUsername: linked.twitchUsername || displayName,
          avatarUrl: linked.avatarUrl || avatarUrl,
        }), {
          path: '/',
          maxAge: 30 * 24 * 60 * 60,
          httpOnly: true,
          sameSite: 'lax',
          secure: req.nextUrl.protocol === 'https:',
        });
      }

      return response;
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
