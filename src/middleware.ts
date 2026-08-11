import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBotSecret } from '@/lib/runtime-secrets';

const SPMT_BASE_URL = String(process.env.SPMT_BASE_URL || 'https://spmt.live').replace(/\/$/, '');
const SPMT_COOKIE = 'chat_tag_spmt_session';
const SPMT_REFRESH_COOKIE = 'chat_tag_spmt_refresh';
const DEFAULT_OWNER_USERNAMES = ['mtman1987'];

const PUBLIC_PREFIXES = [
  '/about',
  '/auth/',
  '/api/auth/',
  '/api/health',
  '/api/overlay/',
  '/overlay',
  '/quackverse',
  '/quackverse-guide',
  '/quackverse-overlay',
  '/quackverse-preview',
  '/api/quackverse/state',
  '/api/quackverse/events',
  '/api/quackverse/pack-preview',
  '/api/quackverse/pack/image',
  '/api/twitch/live',
  '/_next/',
  '/favicon.ico',
];

const ADMIN_PREFIXES = ['/api/admin/', '/api/settings', '/settings', '/api/logs', '/api/tag/mod-log'];

function hasValidBotSecret(request: NextRequest): boolean {
  const supplied = String(
    request.headers.get('x-bot-secret') || request.nextUrl.searchParams.get('secret') || ''
  ).trim();
  if (!supplied) return false;
  try {
    return supplied === getBotSecret();
  } catch {
    return false;
  }
}

function debugEnabled(scope: string) {
  const value = String(process.env.DEBUG || '').toLowerCase();
  if (!value) return false;
  const scopes = value.split(',').map((item) => item.trim()).filter(Boolean);
  return scopes.some((item) => item === '1' || item === 'true' || item === '*' || item === 'all' || item === scope);
}

function trustedOwnerUsernames(): Set<string> {
  const configured = String(process.env.CHAT_TAG_OWNER_USERNAMES || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return new Set(configured.length > 0 ? configured : DEFAULT_OWNER_USERNAMES);
}

function isAdmin(identity: any): boolean {
  if (identity?.isAdmin === true || identity?.is_admin === true || identity?.is_admin === 1) return true;
  const role = String(identity?.role || '').toLowerCase();
  const roles = Array.isArray(identity?.roles) ? identity.roles.map((value: unknown) => String(value).toLowerCase()) : [];
  if (role === 'admin' || role === 'owner' || roles.includes('admin') || roles.includes('owner')) return true;

  const ownerNames = trustedOwnerUsernames();
  const verifiedNames = [
    identity?.username,
    identity?.twitchUsername,
    identity?.twitch_username,
    identity?.displayName,
    identity?.display_name,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  return verifiedNames.some((value) => ownerNames.has(value));
}

async function fetchSpmtIdentity(token: string) {
  if (!token) return null;
  const response = await fetch(`${SPMT_BASE_URL}/api/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  }).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json().catch(() => null);
  const identity = payload?.user || payload?.profile || payload;
  return identity?.id ? identity : null;
}

async function refreshSpmtSession(request: NextRequest) {
  const refreshToken = request.cookies.get(SPMT_REFRESH_COOKIE)?.value || '';
  const clientSecret = String(process.env.CHAT_TAG_CLIENT_SECRET || '');
  if (!refreshToken || !clientSecret) return null;
  const response = await fetch(`${SPMT_BASE_URL}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: 'chat-tag',
      client_secret: clientSecret,
    }),
    cache: 'no-store',
  }).catch(() => null);
  if (!response?.ok) return null;
  const tokens = await response.json().catch(() => null);
  if (!tokens?.access_token || !tokens?.refresh_token) return null;
  const identity = tokens.user?.id ? tokens.user : await fetchSpmtIdentity(tokens.access_token);
  return identity ? { identity, tokens } : null;
}

async function verifyLegacySession(request: NextRequest) {
  const token = request.cookies.get('session')?.value || '';
  const secret = process.env.NEXTAUTH_SECRET || process.env.BOT_SECRET_KEY || '';
  if (!token || !secret) return null;
  try {
    const decodeBase64Url = (value: string) => {
      const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
      return atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    };
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const supplied = Uint8Array.from(decodeBase64Url(signature), (char) => char.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, supplied, new TextEncoder().encode(payload));
    if (!valid) return null;
    const decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(decodeBase64Url(payload), (char) => char.charCodeAt(0))));
    if (!decoded?.id || (decoded.exp && decoded.exp < Date.now())) return null;
    return decoded;
  } catch {
    return null;
  }
}

function isStatic(pathname: string) {
  return pathname.includes('.') && !pathname.endsWith('.html');
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestHost = request.headers.get('host') || '';
  const forwardedHost = request.headers.get('x-forwarded-host') || '';
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const origin = request.headers.get('origin') || '';
  const referer = request.headers.get('referer') || '';
  const hostSignals = [request.nextUrl.host, request.nextUrl.hostname, requestHost, forwardedHost, request.headers.get('forwarded'), origin, referer].filter(Boolean).join(' ');
  const tunnelOnlyMode = process.env.QUACKVERSE_TUNNEL_ONLY === '1';
  const isTunnelHost = tunnelOnlyMode || /ngrok|trycloudflare|loca\.lt|localtunnel/i.test(hostSignals);

  if (debugEnabled('quackverse') && (pathname === '/quackverse' || pathname.startsWith('/api/quackverse/') || pathname === '/favicon.ico')) {
    console.log('[quackverse:request]', { path: pathname + search, host: requestHost, xForwardedHost: forwardedHost, xForwardedFor: forwardedFor, origin, referer, tunnelOnlyMode, isTunnelHost });
  }

  if (pathname.startsWith('/overlay&')) {
    const url = request.nextUrl.clone();
    url.pathname = '/overlay';
    url.search = search;
    return NextResponse.redirect(url);
  }

  if (isTunnelHost) {
    const allowed = pathname === '/' || pathname === '/quackverse' || pathname === '/quackverse-command' || pathname === '/quackverse-overlay' || pathname === '/api/quackverse/state' || pathname === '/api/quackverse/events' || pathname === '/api/quackverse/action' || pathname === '/api/quackverse/test-players' || pathname.startsWith('/_next/') || pathname === '/favicon.ico';
    if (pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = '/quackverse';
      return NextResponse.redirect(url);
    }
    if (!allowed) return new NextResponse('Quackverse testing tunnel only.', { status: 403 });
  }

  const isPublicTagRead = request.method === 'GET' && pathname === '/api/tag';
  const isPublicLiveMembersRead = request.method === 'GET' && pathname === '/api/discord/live-members';
  if (pathname === '/' || isPublicTagRead || isPublicLiveMembersRead || PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix)) || isStatic(pathname)) {
    return NextResponse.next();
  }

  // Service-to-service calls must prove possession of the shared secret.
  // This restores bot access to /api/tag without exposing every machine route.
  if (hasValidBotSecret(request)) {
    return NextResponse.next();
  }

  let accessToken = request.cookies.get(SPMT_COOKIE)?.value || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  let identity = await fetchSpmtIdentity(accessToken);
  let refreshed: Awaited<ReturnType<typeof refreshSpmtSession>> = null;
  if (!identity) {
    refreshed = await refreshSpmtSession(request);
    if (refreshed) {
      identity = refreshed.identity;
      accessToken = refreshed.tokens.access_token;
    }
  }
  const legacySession = identity ? null : await verifyLegacySession(request);
  if (!identity && !legacySession) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Sign in with SPMT or Twitch to continue' }, { status: 401 });
    return NextResponse.redirect(new URL('/', request.url));
  }

  const admin = isAdmin(identity);
  if (ADMIN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix)) && !admin) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'SPMT admin required' }, { status: 403 });
    return NextResponse.redirect(new URL('/', request.url));
  }

  const headers = new Headers(request.headers);
  if (identity) {
    headers.set('x-spmt-user-id', String(identity.id));
    headers.set('x-spmt-username', encodeURIComponent(String(identity.username || '')));
    headers.set('x-spmt-display-name', encodeURIComponent(String(identity.twitchUsername || identity.twitch_username || identity.displayName || identity.display_name || identity.username || 'SPMT user')));
    headers.set('x-spmt-avatar-url', encodeURIComponent(String(identity.avatarUrl || identity.avatar_url || '')));
    headers.set('x-spmt-is-admin', admin ? '1' : '0');
  }
  const response = NextResponse.next({ request: { headers } });
  if (refreshed) {
    const secure = request.nextUrl.protocol === 'https:';
    response.cookies.set(SPMT_COOKIE, accessToken, { path: '/', maxAge: Number(refreshed.tokens.expires_in) || 7 * 24 * 60 * 60, httpOnly: true, sameSite: 'lax', secure });
    response.cookies.set(SPMT_REFRESH_COOKIE, refreshed.tokens.refresh_token, { path: '/', maxAge: Number(refreshed.tokens.refresh_expires_in) || 30 * 24 * 60 * 60, httpOnly: true, sameSite: 'lax', secure });
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
