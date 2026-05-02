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

export function requireAdminRequest(
  req: NextRequest
): { ok: true; user: SessionUser } | { ok: false; response: NextResponse } {
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
