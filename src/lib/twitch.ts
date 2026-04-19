const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const TWITCH_USERS_URL = 'https://api.twitch.tv/helix/users';

let cachedAppToken: { token: string; expiresAt: number } | null = null;

function getClientId(): string {
  return process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID || process.env.TWITCH_CLIENT_ID || '';
}

function getClientSecret(): string {
  return process.env.TWITCH_CLIENT_SECRET || '';
}

async function getAppAccessToken(): Promise<string> {
  if (cachedAppToken && Date.now() < cachedAppToken.expiresAt) {
    return cachedAppToken.token;
  }

  const clientId = getClientId();
  const clientSecret = getClientSecret();
  if (!clientId || !clientSecret) return '';

  try {
    const res = await fetch(TWITCH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    });
    if (!res.ok) return '';
    const data = await res.json();
    cachedAppToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
    return data.access_token;
  } catch {
    return '';
  }
}

export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
}

export async function lookupTwitchUser(login: string): Promise<TwitchUser | null> {
  const token = await getAppAccessToken();
  const clientId = getClientId();
  if (!token || !clientId) return null;

  try {
    const res = await fetch(`${TWITCH_USERS_URL}?login=${encodeURIComponent(login.toLowerCase())}`, {
      headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0] || null;
  } catch {
    return null;
  }
}

export async function lookupTwitchUsers(logins: string[]): Promise<TwitchUser[]> {
  if (logins.length === 0) return [];
  const token = await getAppAccessToken();
  const clientId = getClientId();
  if (!token || !clientId) return [];

  const results: TwitchUser[] = [];
  for (let i = 0; i < logins.length; i += 100) {
    const batch = logins.slice(i, i + 100);
    const query = batch.map(l => `login=${encodeURIComponent(l.toLowerCase())}`).join('&');
    try {
      const res = await fetch(`${TWITCH_USERS_URL}?${query}`, {
        headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        results.push(...(data.data || []));
      }
    } catch {}
  }
  return results;
}
