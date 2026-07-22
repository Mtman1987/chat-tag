import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { updateAppState } from '@/lib/volume-store';
import { createSessionToken } from '@/lib/session';
import { getPublicAppOrigin } from '@/lib/public-origin';
import { getRuntimePublicValueWithDevFallback } from '@/lib/runtime-config.server';
import { getBotSecret } from '@/lib/runtime-secrets';
import { grandfatherSpmtIdentity } from '@/lib/spmt-client';

function verifyDshBridge(searchParams: URLSearchParams) {
  const signature = String(searchParams.get('signature') || '');
  const issuedAt = Number(searchParams.get('issued_at') || 0);
  const bridgeSecret = getBotSecret();
  if (!signature || !issuedAt || !bridgeSecret || Math.abs(Date.now() - issuedAt) > 5 * 60 * 1000) return false;
  const canonical = [
    searchParams.get('user_id') || '',
    searchParams.get('username') || '',
    searchParams.get('display_name') || '',
    searchParams.get('photo_url') || '',
    String(issuedAt),
  ].join('|');
  const expected = crypto.createHmac('sha256', bridgeSecret).update(canonical).digest('hex');
  const supplied = Buffer.from(signature, 'hex');
  const wanted = Buffer.from(expected, 'hex');
  return supplied.length === wanted.length && crypto.timingSafeEqual(supplied, wanted);
}

function setSpmtSessionCookie(response: NextResponse, accessToken: string | undefined, secure: boolean) {
  if (!accessToken) return;
  response.cookies.set('chat_tag_spmt_session', accessToken, {
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
    httpOnly: true,
    sameSite: 'lax',
    secure,
  });
}

function getConfiguredAppUrl(req: NextRequest) {
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

  const fallback = getPublicAppOrigin(req);
  if (fallback) return fallback.replace(/\/$/, '');

  throw new Error('Public app URL is not configured.');
}

function getTwitchRedirectUri(req: NextRequest) {
  const explicit = String(process.env.TWITCH_OAUTH_REDIRECT_URI || '').trim();
  if (explicit) return explicit;
  return `${getConfiguredAppUrl(req)}/api/auth/twitch/callback`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const success = searchParams.get('success');
  const bridgedUserId = searchParams.get('user_id');
  const bridgedUsername = searchParams.get('username') || searchParams.get('display_name');
  const bridgedAvatarUrl = searchParams.get('photo_url') || '';
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const appUrl = getConfiguredAppUrl(req);
  const callbackUrl = new URL('/auth/callback', appUrl);

  if (success === 'true' && bridgedUserId && bridgedUsername) {
    if (!verifyDshBridge(searchParams)) {
      callbackUrl.searchParams.set('error', 'invalid_identity_bridge');
      callbackUrl.searchParams.set('error_description', 'The cross-app login handoff could not be verified. Please use Twitch sign-in directly.');
      return NextResponse.redirect(callbackUrl);
    }
    await updateAppState((draft) => {
      draft.users[bridgedUserId] = {
        ...(draft.users[bridgedUserId] || {}),
        id: bridgedUserId,
        twitchUsername: bridgedUsername,
        avatarUrl: bridgedAvatarUrl,
      };
    });

    const sessionToken = createSessionToken({
      id: bridgedUserId,
      twitchUsername: bridgedUsername,
      avatarUrl: bridgedAvatarUrl,
    });

    callbackUrl.searchParams.set('twitchUsername', bridgedUsername);
    if (bridgedAvatarUrl) callbackUrl.searchParams.set('avatarUrl', bridgedAvatarUrl);

    const response = NextResponse.redirect(callbackUrl);
    response.cookies.set('session', sessionToken, {
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: true,
      sameSite: 'lax',
      secure: appUrl.startsWith('https://'),
    });
    const grandfathered = await grandfatherSpmtIdentity({
      twitchId: bridgedUserId,
      twitchUsername: bridgedUsername,
      displayName: searchParams.get('display_name') || bridgedUsername,
      issueSession: true,
    });
    setSpmtSessionCookie(response, grandfathered?.accessToken, appUrl.startsWith('https://'));
    return response;
  }

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

  const expectedState = req.cookies.get('chat_tag_oauth_state')?.value;
  const returnedState = searchParams.get('state');
  if (!expectedState || !returnedState || expectedState !== returnedState) {
    callbackUrl.searchParams.set('error', 'invalid_oauth_state');
    callbackUrl.searchParams.set('error_description', 'The Twitch login state expired or did not match. Please try again.');
    return NextResponse.redirect(callbackUrl);
  }

  try {
    const twitchClientId =
      process.env.TWITCH_OAUTH_CLIENT_ID ||
      getRuntimePublicValueWithDevFallback('twitchClientId', [
        'NEXT_PUBLIC_TWITCH_CLIENT_ID',
        'TWITCH_CLIENT_ID',
      ]);
    const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
    const twitchRedirectUri = getTwitchRedirectUri(req);
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
        redirect_uri: twitchRedirectUri,
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

    callbackUrl.searchParams.set('twitchUsername', twitchUser.display_name);
    callbackUrl.searchParams.set('avatarUrl', twitchUser.profile_image_url);

    const response = NextResponse.redirect(callbackUrl);
    response.cookies.set('session', sessionToken, {
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: true,
      sameSite: 'lax',
      secure: appUrl.startsWith('https://'),
    });

    response.cookies.set('chat_tag_oauth_state', '', { path: '/', maxAge: 0 });
    const grandfathered = await grandfatherSpmtIdentity({
      twitchId: twitchUser.id,
      twitchUsername: twitchUser.login || twitchUser.display_name,
      displayName: twitchUser.display_name,
      issueSession: true,
    });
    setSpmtSessionCookie(response, grandfathered?.accessToken, appUrl.startsWith('https://'));

    return response;
  } catch (err: any) {
    callbackUrl.searchParams.set('error', 'server_error');
    callbackUrl.searchParams.set('error_description', err.message || 'An internal server error occurred.');
    return NextResponse.redirect(callbackUrl);
  }
}
