'use server';
import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase'; // Use client-side init for reading public settings
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// This is a server-side route that reads the public client ID and initiates the redirect.
export async function GET(req: NextRequest) {
  try {
    // This is a temporary, non-ideal way to get settings on the server.
    // In a production app, you would use the Admin SDK if this were a protected
    // route, or have the client ID available as an environment variable.
    // Since this is a public value, we can initialize a temporary client app to read it.
    const { firestore } = initializeFirebase();
    const settingsDocRef = doc(firestore, 'gameSettings', 'default');
    const settingsSnap = await getDoc(settingsDocRef);

    if (!settingsSnap.exists() || !settingsSnap.data().twitchClientId) {
      throw new Error('Twitch Client ID is not configured in Firestore settings.');
    }
    
    const twitchClientId = settingsSnap.data().twitchClientId;
    const redirectUri = `${new URL(req.url).origin}/api/auth/twitch/callback`;
    const scope = 'user:read:email';
    const responseType = 'code';

    const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
    authUrl.searchParams.set('client_id', twitchClientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', responseType);
    authUrl.searchParams.set('scope', scope);

    return NextResponse.redirect(authUrl.toString());
  } catch (error: any) {
    console.error("Error starting Twitch auth flow:", error);
    const homeUrl = new URL('/', req.url);
    homeUrl.searchParams.set('error', 'auth_start_failed');
    homeUrl.searchParams.set('error_description', error.message || 'Could not initiate Twitch login.');
    return NextResponse.redirect(homeUrl);
  }
}
