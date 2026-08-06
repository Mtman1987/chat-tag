import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, type SessionUser } from '@/lib/session';

export function getSessionUserFromRequest(req: NextRequest): SessionUser | null {
  const spmtUserId = String(req.headers.get('x-spmt-user-id') || '').trim();
  if (spmtUserId) {
    return {
      id: spmtUserId,
      twitchUsername: String(req.headers.get('x-spmt-username') || 'spmt-user'),
      avatarUrl: '',
    };
  }

  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, '').trim();
  const cookieToken = req.cookies.get('session')?.value;
  const token = cookieToken || bearerToken;
  return token ? verifySessionToken(token) : null;
}

export function isBotRequest(req: NextRequest): boolean {
  return req.nextUrl.pathname.startsWith('/api/bot/') || req.nextUrl.pathname.startsWith('/api/discord/') || req.nextUrl.pathname.startsWith('/api/kick/');
}

export function requireAdminRequest(
  req: NextRequest
): { ok: true; user: SessionUser } | { ok: false; response: NextResponse } {
  const sessionUser = getSessionUserFromRequest(req);
  if (!sessionUser) {
    return { ok: false, response: NextResponse.json({ error: 'SPMT authentication required.' }, { status: 401 }) };
  }

  if (req.headers.get('x-spmt-is-admin') !== '1') {
    return { ok: false, response: NextResponse.json({ error: 'SPMT admin access required.' }, { status: 403 }) };
  }

  return { ok: true, user: sessionUser };
}
