import { NextRequest, NextResponse } from 'next/server';
import { isAdminUsername } from '@/lib/admin';
import { verifySessionToken, type SessionUser } from '@/lib/session';

export function getSessionUserFromRequest(req: NextRequest): SessionUser | null {
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, '').trim();
  const cookieToken = req.cookies.get('session')?.value;
  const token = bearerToken || cookieToken;
  if (!token) return null;
  return verifySessionToken(token);
}

export function isBotRequest(req: NextRequest): boolean {
  const secret = req.headers.get('x-bot-secret') || req.nextUrl.searchParams.get('secret');
  return Boolean(secret && secret === (process.env.BOT_SECRET_KEY || '1234'));
}

export function requireAdminRequest(
  req: NextRequest
): { ok: true; user: SessionUser } | { ok: false; response: NextResponse } {
  if (isBotRequest(req)) {
    return {
      ok: true,
      user: {
        id: 'bot-service',
        twitchUsername: 'bot-service',
        avatarUrl: '',
      },
    };
  }

  const sessionUser = getSessionUserFromRequest(req);
  if (!sessionUser) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }),
    };
  }

  if (!isAdminUsername(sessionUser.twitchUsername)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Admin access required.' }, { status: 403 }),
    };
  }

  return { ok: true, user: sessionUser };
}
