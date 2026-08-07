import { NextRequest, NextResponse } from 'next/server';
import { getPublicAppOrigin } from '@/lib/public-origin';

const SPMT_BASE_URL = String(process.env.SPMT_BASE_URL || 'https://spmt.live').replace(/\/$/, '');

export async function GET(request: NextRequest) {
  const appOrigin = getPublicAppOrigin(request).replace(/\/$/, '');
  const finishUrl = new URL('/auth/callback', appOrigin);
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get('chat_tag_spmt_oauth_state')?.value;
  const clientSecret = String(process.env.CHAT_TAG_CLIENT_SECRET || '');

  if (!code || !state || !expectedState || state !== expectedState || !clientSecret) {
    finishUrl.searchParams.set('error', 'spmt_auth_failed');
    finishUrl.searchParams.set('error_description', !clientSecret ? 'Chat Tag SPMT login is not configured.' : 'The SPMT login expired or could not be verified.');
    return NextResponse.redirect(finishUrl);
  }

  const redirectUri = `${appOrigin}/auth/spmt/callback`;
  const tokenResponse = await fetch(`${SPMT_BASE_URL}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ code, client_id: 'chat-tag', client_secret: clientSecret, redirect_uri: redirectUri }),
    cache: 'no-store',
  }).catch(() => null);
  const tokens = await tokenResponse?.json().catch(() => null);
  if (!tokenResponse?.ok || !tokens?.access_token || !tokens?.refresh_token) {
    finishUrl.searchParams.set('error', 'spmt_token_exchange_failed');
    finishUrl.searchParams.set('error_description', tokens?.error || 'SPMT could not finish signing you in.');
    return NextResponse.redirect(finishUrl);
  }

  const user = tokens.user || {};
  finishUrl.searchParams.set('twitchUsername', user.twitchUsername || user.twitch_username || user.displayName || user.display_name || user.username || 'SPMT user');
  if (user.avatarUrl || user.avatar_url) finishUrl.searchParams.set('avatarUrl', user.avatarUrl || user.avatar_url);

  const response = NextResponse.redirect(finishUrl);
  const secure = appOrigin.startsWith('https://');
  response.cookies.set('chat_tag_spmt_session', tokens.access_token, { path: '/', maxAge: Number(tokens.expires_in) || 7 * 24 * 60 * 60, httpOnly: true, sameSite: 'lax', secure });
  response.cookies.set('chat_tag_spmt_refresh', tokens.refresh_token, { path: '/', maxAge: Number(tokens.refresh_expires_in) || 30 * 24 * 60 * 60, httpOnly: true, sameSite: 'lax', secure });
  response.cookies.set('chat_tag_spmt_oauth_state', '', { path: '/', maxAge: 0 });
  return response;
}
