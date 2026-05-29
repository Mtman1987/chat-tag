import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function debugEnabled(scope: string) {
  const value = String(process.env.DEBUG || '').toLowerCase();
  if (!value) return false;
  const scopes = value.split(',').map((item) => item.trim()).filter(Boolean);
  return scopes.some((item) => item === '1' || item === 'true' || item === '*' || item === 'all' || item === scope);
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestHost = request.headers.get('host') || '';
  const forwardedHost = request.headers.get('x-forwarded-host') || '';
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const origin = request.headers.get('origin') || '';
  const referer = request.headers.get('referer') || '';
  const hostSignals = [
    request.nextUrl.host,
    request.nextUrl.hostname,
    requestHost,
    forwardedHost,
    request.headers.get('forwarded'),
    origin,
    referer,
  ]
    .filter(Boolean)
    .join(' ');
  const tunnelOnlyMode = process.env.QUACKVERSE_TUNNEL_ONLY === '1';
  const isTunnelHost = tunnelOnlyMode || /ngrok|trycloudflare|loca\.lt|localtunnel/i.test(hostSignals);

  if (
    debugEnabled('quackverse') &&
    (pathname === '/quackverse' || pathname.startsWith('/api/quackverse/') || pathname === '/favicon.ico')
  ) {
    console.log('[quackverse:request]', {
      path: pathname + search,
      host: requestHost,
      xForwardedHost: forwardedHost,
      xForwardedFor: forwardedFor,
      origin,
      referer,
      tunnelOnlyMode,
      isTunnelHost,
    });
  }

  if (pathname.startsWith('/overlay&')) {
    const url = request.nextUrl.clone();
    url.pathname = '/overlay';
    url.search = search;
    return NextResponse.redirect(url);
  }

  if (isTunnelHost) {
    const allowed =
      pathname === '/' ||
      pathname === '/quackverse' ||
      pathname === '/quackverse-command' ||
      pathname === '/quackverse-overlay' ||
      pathname === '/api/quackverse/state' ||
      pathname === '/api/quackverse/events' ||
      pathname === '/api/quackverse/action' ||
      pathname === '/api/quackverse/test-players' ||
      pathname.startsWith('/_next/') ||
      pathname === '/favicon.ico';

    if (pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = '/quackverse';
      return NextResponse.redirect(url);
    }

    if (!allowed) {
      return new NextResponse('Quackverse testing tunnel only.', { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!.*\\.).*)', '/overlay&:path*', '/_next/:path*', '/favicon.ico'],
};
