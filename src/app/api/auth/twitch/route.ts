import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const twitchClientId =
      process.env.TWITCH_OAUTH_CLIENT_ID ||
      process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID ||
      process.env.TWITCH_CLIENT_ID;
    if (!twitchClientId) {
      throw new Error('Twitch Client ID is not configured.');
    }

    const redirectUri =
      process.env.TWITCH_OAUTH_REDIRECT_URI ||
      'https://discord-stream-hub-new.fly.dev/api/twitch/oauth/callback';

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
