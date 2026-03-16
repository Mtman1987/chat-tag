'use server';
import { NextRequest, NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';

export async function GET(req: NextRequest) {
  try {
    const state = await readAppState();
    const settings = state.gameSettings.default || {};

    if (!settings.twitchClientId) {
      throw new Error('Twitch Client ID is not configured in settings.');
    }

    const twitchClientId = settings.twitchClientId;
    const redirectUri = `${new URL(req.url).origin}/api/auth/twitch/callback`;

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