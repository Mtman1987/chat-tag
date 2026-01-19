'use server';

import { NextRequest, NextResponse } from 'next/server';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { doc, getFirestore, setDoc } from 'firebase-admin/firestore';
import type { GameSettings } from '@/lib/types';

// This is the server-side callback route that Twitch redirects to.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const callbackUrl = new URL('/auth/callback', req.url); // The client-side page to redirect to

  if (error) {
    console.error(`Twitch OAuth Error: ${error} - ${errorDescription}`);
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
    const adminDb = getFirestore(adminApp);

    const settingsRef = doc(adminDb, 'gameSettings', 'default');
    const settingsSnap = await settingsRef.get();
    if (!settingsSnap.exists()) {
        throw new Error('Game settings are not configured in Firestore.');
    }
    const settings = settingsSnap.data() as GameSettings;

    const { twitchClientId, twitchClientSecret } = settings;
    if (!twitchClientId || !twitchClientSecret) {
        throw new Error('Twitch client ID or secret is not configured in game settings.');
    }

    // 1. Exchange the code for an access token
    const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: twitchClientId,
        client_secret: twitchClientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: `${new URL(req.url).origin}/api/auth/twitch/callback`,
      }),
    });
    
    if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        console.error('Twitch Token Exchange Error:', errorData);
        throw new Error(`Failed to exchange Twitch code for token. Reason: ${errorData.message}`);
    }

    const { access_token } = await tokenResponse.json();

    // 2. Use the access token to get the user's profile from Twitch
    const userResponse = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Client-ID': twitchClientId,
      },
    });

    if (!userResponse.ok) {
      throw new Error('Failed to fetch user profile from Twitch.');
    }

    const { data: userData } = await userResponse.json();
    const twitchUser = userData[0];

    // 3. Create a Firebase custom token for the user
    const firebaseToken = await adminAuth.createCustomToken(twitchUser.id);
    
    // 4. Upsert user data into Firestore
    const userRef = doc(adminDb, 'users', twitchUser.id);
    await setDoc(userRef, {
        id: twitchUser.id,
        twitchUsername: twitchUser.display_name,
        avatarUrl: twitchUser.profile_image_url,
    }, { merge: true });


    // 5. Redirect to the client-side callback page with the Firebase token
    callbackUrl.searchParams.set('token', firebaseToken);
    callbackUrl.searchParams.set('twitchUserId', twitchUser.id);
    callbackUrl.searchParams.set('twitchUsername', twitchUser.display_name);
    callbackUrl.searchParams.set('avatarUrl', twitchUser.profile_image_url);

    return NextResponse.redirect(callbackUrl);

  } catch (err: any) {
    console.error('Full authentication process failed:', err);
    callbackUrl.searchParams.set('error', 'server_error');
    callbackUrl.searchParams.set('error_description', err.message || 'An internal server error occurred.');
    return NextResponse.redirect(callbackUrl);
  }
}
