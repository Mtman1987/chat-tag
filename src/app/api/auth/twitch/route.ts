import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const twitchClientId = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID || process.env.TWITCH_CLIENT_ID;
    if (!twitchClientId) {
      throw new Error('Twitch Client ID is not configured.');
    }

    // Use env var or derive from request for redirect URI
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    const redirectUri = `${appUrl}/api/auth/twitch/callback`;

    const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
    authUrl.searchParams.set('client_id', twitchClientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'user:read:email');

    return NextResponse.redirect(authUrl.toString());
  } catch (error: any) {
    const homeUrl = new URL('/', req.url);
    homeUrl.searchParams.set('error', 'auth_start_failed');
    homeUrl.searchParams.set('error_description', error.message || 'Could not initiate Twitch login.');
    return NextResponse.redirect(homeUrl);
  }
}
