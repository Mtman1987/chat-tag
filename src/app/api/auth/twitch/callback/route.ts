import { NextRequest, NextResponse } from 'next/server';
import { updateAppState } from '@/lib/volume-store';
import { createSessionToken } from '@/lib/session';

function getAppUrl(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const appUrl = getAppUrl(req);
  const callbackUrl = new URL('/auth/callback', appUrl);

  if (error) {
    callbackUrl.searchParams.set('error', 'twitch_auth_failed');
    callbackUrl.searchParams.set('error_description', errorDescription || 'The user denied authorization.');
    return NextResponse.redirect(callbackUrl);
  }

  if (!code) {
    callbackUrl.searchParams.set('error', 'missing_auth_code');
    callbackUrl.searchParams.set('error_description', 'The Twitch authorization code was not found.');
    return NextResponse.redirect(callbackUrl);
  }

  try {
    const twitchClientId = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID || process.env.TWITCH_CLIENT_ID;
    const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
    if (!twitchClientId || !twitchClientSecret) {
      throw new Error('Twitch client ID or secret is not configured.');
    }

    const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: twitchClientId,
        client_secret: twitchClientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${appUrl}/api/auth/twitch/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      throw new Error(`Failed to exchange Twitch code for token. Reason: ${errorData.message}`);
    }

    const { access_token } = await tokenResponse.json();

    const userResponse = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Client-ID': twitchClientId,
      },
    });

    if (!userResponse.ok) {
      throw new Error('Failed to fetch user profile from Twitch.');
    }

    const { data: userData } = await userResponse.json();
    const twitchUser = userData[0];

    // Store user in volume
    await updateAppState((draft) => {
      draft.users[twitchUser.id] = {
        ...(draft.users[twitchUser.id] || {}),
        id: twitchUser.id,
        twitchUsername: twitchUser.display_name,
        avatarUrl: twitchUser.profile_image_url,
      };
    });

    // Create session token
    const sessionToken = createSessionToken({
      id: twitchUser.id,
      twitchUsername: twitchUser.display_name,
      avatarUrl: twitchUser.profile_image_url,
    });

    callbackUrl.searchParams.set('session', sessionToken);
    callbackUrl.searchParams.set('twitchUsername', twitchUser.display_name);
    callbackUrl.searchParams.set('avatarUrl', twitchUser.profile_image_url);

    return NextResponse.redirect(callbackUrl);
  } catch (err: any) {
    callbackUrl.searchParams.set('error', 'server_error');
    callbackUrl.searchParams.set('error_description', err.message || 'An internal server error occurred.');
    return NextResponse.redirect(callbackUrl);
  }
}
