import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, type SessionUser } from '@/lib/session';
import { getBotSecret } from '@/lib/runtime-secrets';

export function getSessionUserFromRequest(req: NextRequest): SessionUser | null {
  const spmtUserId = String(req.headers.get('x-spmt-user-id') || '').trim();
  if (spmtUserId) {
    const displayName = decodeURIComponent(
      req.headers.get('x-spmt-display-name')
      || req.headers.get('x-spmt-username')
      || 'spmt-user',
    );
    return {
      id: spmtUserId,
      twitchUsername: displayName,
      avatarUrl: decodeURIComponent(req.headers.get('x-spmt-avatar-url') || ''),
    };
  }

  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, '').trim();
  const cookieToken = req.cookies.get('session')?.value;
  const token = cookieToken || bearerToken;
  return token ? verifySessionToken(token) : null;
}

export function isBotRequest(req: NextRequest): boolean {
  const supplied = String(
    req.headers.get('x-bot-secret') || req.nextUrl.searchParams.get('secret') || ''
  ).trim();
  if (!supplied) return false;
  try {
    return supplied === getBotSecret();
  } catch {
    return false;
  }
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
    return { ok: false, response: NextResponse.json({ error: 'SPMT authentication required.' }, { status: 401 }) };
  }

  if (req.headers.get('x-spmt-is-admin') !== '1') {
    return { ok: false, response: NextResponse.json({ error: 'SPMT admin access required.' }, { status: 403 }) };
  }

  return { ok: true, user: sessionUser };
}
