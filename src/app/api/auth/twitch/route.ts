import { NextRequest, NextResponse } from 'next/server';
import { getRuntimePublicValueWithDevFallback } from '@/lib/runtime-config.server';

function getConfiguredAppUrl() {
  const candidates = [
    process.env.CHAT_TAG_PUBLIC_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.PUBLIC_APP_URL,
    process.env.APP_URL,
  ];

  for (const value of candidates) {
    const normalized = String(value || '').trim().replace(/\/$/, '');
    if (normalized) return normalized;
  }

  throw new Error('Public app URL is not configured.');
}

function getTwitchRedirectUri() {
  const explicit = String(process.env.TWITCH_OAUTH_REDIRECT_URI || '').trim();
  if (explicit) return explicit;
  return `${getConfiguredAppUrl()}/api/auth/twitch/callback`;
}

export async function GET(req: NextRequest) {
  try {
    const twitchClientId =
      process.env.TWITCH_OAUTH_CLIENT_ID ||
      getRuntimePublicValueWithDevFallback('twitchClientId', [
        'NEXT_PUBLIC_TWITCH_CLIENT_ID',
        'TWITCH_CLIENT_ID',
      ]);
    if (!twitchClientId) {
      throw new Error('Twitch Client ID is not configured.');
    }

    const redirectUri = getTwitchRedirectUri();

    const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
    authUrl.searchParams.set('client_id', twitchClientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'user:read:email');
    authUrl.searchParams.set('state', 'chat-tag');
    authUrl.searchParams.set('force_verify', 'true');

    return NextResponse.redirect(authUrl.toString());
  } catch (error: any) {
    const homeUrl = new URL('/', req.url);
    homeUrl.searchParams.set('error', 'auth_start_failed');
    homeUrl.searchParams.set('error_description', error.message || 'Could not initiate Twitch login.');
    return NextResponse.redirect(homeUrl);
  }
}
