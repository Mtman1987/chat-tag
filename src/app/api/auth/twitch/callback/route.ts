'use server';

import { NextRequest, NextResponse } from 'next/server';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { readAppState, updateAppState } from '@/lib/volume-store';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const callbackUrl = new URL('/auth/callback', req.url);

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
    const adminApp = initializeAdminApp();
    const adminAuth = getAuth(adminApp);

    const state = await readAppState();
    const settings = state.gameSettings.default || {};

    const { twitchClientId, twitchClientSecret } = settings;
    if (!twitchClientId || !twitchClientSecret) {
      throw new Error('Twitch client ID or secret is not configured in settings.');
    }

    const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: twitchClientId,
        client_secret: twitchClientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${new URL(req.url).origin}/api/auth/twitch/callback`,
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

    const firebaseToken = await adminAuth.createCustomToken(twitchUser.id);

    await updateAppState((draft) => {
      draft.users[twitchUser.id] = {
        ...(draft.users[twitchUser.id] || {}),
        id: twitchUser.id,
        twitchUsername: twitchUser.display_name,
        avatarUrl: twitchUser.profile_image_url,
      };
    });

    callbackUrl.searchParams.set('token', firebaseToken);
    callbackUrl.searchParams.set('twitchUserId', twitchUser.id);
    callbackUrl.searchParams.set('twitchUsername', twitchUser.display_name);
    callbackUrl.searchParams.set('avatarUrl', twitchUser.profile_image_url);

    return NextResponse.redirect(callbackUrl);
  } catch (err: any) {
    callbackUrl.searchParams.set('error', 'server_error');
    callbackUrl.searchParams.set('error_description', err.message || 'An internal server error occurred.');
    return NextResponse.redirect(callbackUrl);
  }
}