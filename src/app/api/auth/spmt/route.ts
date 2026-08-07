import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getPublicAppOrigin } from '@/lib/public-origin';

const SPMT_BASE_URL = String(process.env.SPMT_BASE_URL || 'https://spmt.live').replace(/\/$/, '');

export async function GET(request: NextRequest) {
  const state = crypto.randomBytes(24).toString('base64url');
  const redirectUri = `${getPublicAppOrigin(request).replace(/\/$/, '')}/auth/spmt/callback`;
  const authorizeUrl = new URL(`${SPMT_BASE_URL}/api/oauth/authorize`);
  authorizeUrl.searchParams.set('client_id', 'chat-tag');
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set('chat_tag_spmt_oauth_state', state, {
    path: '/', maxAge: 10 * 60, httpOnly: true, sameSite: 'lax', secure: redirectUri.startsWith('https://'),
  });
  return response;
}
