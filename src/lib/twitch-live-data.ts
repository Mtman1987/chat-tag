import { getRuntimePublicValueWithDevFallback } from '@/lib/runtime-config.server';

type SharedSessionResponse = {
  data?: Array<{
    session_id: string;
    host_broadcaster_id: string;
    participants: Array<{ broadcaster_id: string }>;
  }>;
};

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
    }
  }
  throw new Error('fetchWithRetry exhausted');
}

export async function fetchTwitchLiveData(usernames: string[]) {
  const normalizedUsernames = Array.isArray(usernames)
    ? usernames.map((user) => String(user || '').trim().toLowerCase()).filter(Boolean)
    : [];

  if (normalizedUsernames.length === 0) {
    return { liveUsers: [], allUsers: [] };
  }

  const clientId =
    getRuntimePublicValueWithDevFallback('twitchClientId', [
      'NEXT_PUBLIC_TWITCH_CLIENT_ID',
      'TWITCH_CLIENT_ID',
      'TWITCH_DEV_CLIENT_ID',
    ]);
  const clientSecret =
    process.env.TWITCH_CLIENT_SECRET ||
    process.env.TWITCH_DEV_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Twitch credentials not configured');
  }

  const tokenResponse = await fetchWithRetry('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error('Failed to get access token');
  }

  const { access_token } = await tokenResponse.json();
  const twitchHeaders = {
    Authorization: `Bearer ${access_token}`,
    'Client-ID': clientId,
  };

  const batchSize = 100;
  const allUsers: any[] = [];

  for (let i = 0; i < normalizedUsernames.length; i += batchSize) {
    const batch = normalizedUsernames.slice(i, i + batchSize);
    const userQueryString = batch.map((u) => `login=${encodeURIComponent(u)}`).join('&');
    try {
      const userResponse = await fetchWithRetry(
        `https://api.twitch.tv/helix/users?${userQueryString}`,
        { headers: twitchHeaders },
      );
      if (userResponse.ok) {
        const userData = await userResponse.json();
        allUsers.push(...(userData.data || []));
      }
    } catch (error) {
      console.error('[Twitch Live Data] Failed to fetch users batch:', error);
    }
  }

  if (allUsers.length === 0) {
    return { liveUsers: [], allUsers: [] };
  }

  const userById = new Map(allUsers.map((u) => [u.id, u]));
  const userIds = allUsers.map((user) => user.id);
  const liveStreams: any[] = [];

  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    const streamQueryString = batch.map((id: string) => `user_id=${encodeURIComponent(id)}`).join('&');
    try {
      const streamResponse = await fetchWithRetry(
        `https://api.twitch.tv/helix/streams?${streamQueryString}`,
        { headers: twitchHeaders },
      );
      if (streamResponse.ok) {
        const streamData = await streamResponse.json();
        liveStreams.push(...(streamData.data || []));
      }
    } catch (error) {
      console.error('[Twitch Live Data] Failed to fetch streams batch:', error);
    }
  }

  const liveUserIds = Array.from(new Set(liveStreams.map((s) => s.user_id)));
  const sharedInfoByLogin: Record<
    string,
    { sharedSessionId: string; isSharedHost: boolean; sharedWith: string[] }
  > = {};

  for (const broadcasterId of liveUserIds) {
    try {
      const sessionRes = await fetchWithRetry(
        `https://api.twitch.tv/helix/shared_chat/session?broadcaster_id=${encodeURIComponent(broadcasterId)}`,
        { headers: twitchHeaders },
      );
      if (!sessionRes.ok) continue;

      const sessionData = (await sessionRes.json()) as SharedSessionResponse;
      const session = sessionData.data?.[0];
      if (!session || !Array.isArray(session.participants) || session.participants.length <= 1) continue;

      const participantLogins = session.participants
        .map((participant) => userById.get(participant.broadcaster_id)?.login)
        .filter((login): login is string => Boolean(login));

      for (const participant of session.participants) {
        const login = userById.get(participant.broadcaster_id)?.login;
        if (!login) continue;
        sharedInfoByLogin[login.toLowerCase()] = {
          sharedSessionId: session.session_id,
          isSharedHost: participant.broadcaster_id === session.host_broadcaster_id,
          sharedWith: participantLogins.filter((item) => item.toLowerCase() !== login.toLowerCase()),
        };
      }
    } catch {
      // Non-fatal: treat channel as non-shared
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const liveUsers = liveStreams.map((stream) => {
    const user = userById.get(stream.user_id);
    const username = (user?.login || stream.user_login || '').toLowerCase();
    const sharedInfo = sharedInfoByLogin[username];

    return {
      id: user?.id || stream.user_id,
      username,
      displayName: user?.display_name || stream.user_name,
      title: stream.title,
      gameName: stream.game_name,
      viewerCount: stream.viewer_count,
      thumbnailUrl: stream.thumbnail_url,
      startedAt: stream.started_at,
      isSharedChat: Boolean(sharedInfo),
      sharedSessionId: sharedInfo?.sharedSessionId || null,
      isSharedHost: sharedInfo?.isSharedHost || false,
      sharedWith: sharedInfo?.sharedWith || [],
    };
  });

  return {
    liveUsers,
    allUsers: allUsers.map((user) => ({
      username: user.login,
      displayName: user.display_name,
      id: user.id,
      profile_image_url: user.profile_image_url,
    })),
  };
}
