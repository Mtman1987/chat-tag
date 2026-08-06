import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SPMT_BASE_URL = String(process.env.SPMT_BASE_URL || 'https://spmt.live').replace(/\/$/, '');
const SPMT_COOKIE = 'chat_tag_spmt_session';

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

const MACHINE_PREFIXES = ['/api/bot/', '/api/discord/', '/api/kick/'];
const ADMIN_PREFIXES = ['/api/admin/', '/api/settings', '/settings', '/api/logs', '/api/tag/mod-log'];

function debugEnabled(scope: string) {
  const value = String(process.env.DEBUG || '').toLowerCase();
  if (!value) return false;
  const scopes = value.split(',').map((item) => item.trim()).filter(Boolean);
  return scopes.some((item) => item === '1' || item === 'true' || item === '*' || item === 'all' || item === scope);
}

function isAdmin(identity: any): boolean {
  if (identity?.isAdmin === true || identity?.is_admin === true || identity?.is_admin === 1) return true;
  const role = String(identity?.role || '').toLowerCase();
  const roles = Array.isArray(identity?.roles) ? identity.roles.map((value: unknown) => String(value).toLowerCase()) : [];
  return role === 'admin' || role === 'owner' || roles.includes('admin') || roles.includes('owner');
}

async function resolveIdentity(request: NextRequest) {
  const token = request.cookies.get(SPMT_COOKIE)?.value || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
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

  if (PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix)) || MACHINE_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || isStatic(pathname)) {
    return NextResponse.next();
  }

  const identity = await resolveIdentity(request);
  if (!identity) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'SPMT session required' }, { status: 401 });
    const login = new URL('/api/auth/twitch', request.url);
    login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  const admin = isAdmin(identity);
  if (ADMIN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix)) && !admin) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'SPMT admin required' }, { status: 403 });
    return NextResponse.redirect(new URL('/', request.url));
  }

  const headers = new Headers(request.headers);
  headers.set('x-spmt-user-id', String(identity.id));
  headers.set('x-spmt-username', String(identity.username || identity.displayName || ''));
  headers.set('x-spmt-is-admin', admin ? '1' : '0');
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
