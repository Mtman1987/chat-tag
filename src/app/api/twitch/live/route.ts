import { NextRequest, NextResponse } from 'next/server';

type SharedSessionResponse = {
  data?: Array<{
    session_id: string;
    host_broadcaster_id: string;
    participants: Array<{ broadcaster_id: string }>;
  }>;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    if (!body) {
      return NextResponse.json({ liveUsers: [], allUsers: [] });
    }

    const { usernames } = JSON.parse(body);

    if (!Array.isArray(usernames) || usernames.length === 0) {
      return NextResponse.json({ error: 'Invalid usernames array' }, { status: 400 });
    }

    const clientId = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Twitch credentials not configured' }, { status: 500 });
    }

    const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
    });

    if (!tokenResponse.ok) {
      return NextResponse.json({ error: 'Failed to get access token' }, { status: 500 });
    }

    const { access_token } = await tokenResponse.json();

    const batchSize = 100;
    const allUsers: any[] = [];

    for (let i = 0; i < usernames.length; i += batchSize) {
      const batch = usernames.slice(i, i + batchSize);
      const userQueryString = batch.map((u) => `login=${encodeURIComponent(u)}`).join('&');
      const userUrl = `https://api.twitch.tv/helix/users?${userQueryString}`;

      const userResponse = await fetch(userUrl, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Client-ID': clientId,
        },
      });

      if (userResponse.ok) {
        const userData = await userResponse.json();
        allUsers.push(...(userData.data || []));
      }
    }

    if (allUsers.length === 0) {
      return NextResponse.json({ liveUsers: [], allUsers: [] });
    }

    const userById = new Map(allUsers.map((u) => [u.id, u]));

    const userIds = allUsers.map((user) => user.id);
    const liveStreams: any[] = [];

    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const streamQueryString = batch.map((id) => `user_id=${id}`).join('&');
      const streamUrl = `https://api.twitch.tv/helix/streams?${streamQueryString}`;

      const streamResponse = await fetch(streamUrl, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Client-ID': clientId,
        },
      });

      if (streamResponse.ok) {
        const streamData = await streamResponse.json();
        liveStreams.push(...(streamData.data || []));
      }
    }

    const liveUserIds = Array.from(new Set(liveStreams.map((s) => s.user_id)));

    const sharedInfoByLogin: Record<
      string,
      { sharedSessionId: string; isSharedHost: boolean; sharedWith: string[] }
    > = {};

    await Promise.all(
      liveUserIds.map(async (broadcasterId) => {
        try {
          const sessionRes = await fetch(
            `https://api.twitch.tv/helix/shared_chat/session?broadcaster_id=${encodeURIComponent(broadcasterId)}`,
            {
              headers: {
                Authorization: `Bearer ${access_token}`,
                'Client-ID': clientId,
              },
            }
          );

          if (!sessionRes.ok) return;

          const sessionData = (await sessionRes.json()) as SharedSessionResponse;
          const session = sessionData.data?.[0];
          if (!session || !Array.isArray(session.participants) || session.participants.length <= 1) return;

          const participantLogins = session.participants
            .map((p) => userById.get(p.broadcaster_id)?.login)
            .filter((login): login is string => Boolean(login));

          for (const participant of session.participants) {
            const login = userById.get(participant.broadcaster_id)?.login;
            if (!login) continue;
            sharedInfoByLogin[login.toLowerCase()] = {
              sharedSessionId: session.session_id,
              isSharedHost: participant.broadcaster_id === session.host_broadcaster_id,
              sharedWith: participantLogins.filter((l) => l.toLowerCase() !== login.toLowerCase()),
            };
          }
        } catch {
          // Non-fatal: if this fails we simply treat channel as non-shared.
        }
      })
    );

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
        isSharedChat: Boolean(sharedInfo),
        sharedSessionId: sharedInfo?.sharedSessionId || null,
        isSharedHost: sharedInfo?.isSharedHost || false,
        sharedWith: sharedInfo?.sharedWith || [],
      };
    });

    return NextResponse.json({
      liveUsers,
      allUsers: allUsers.map((user) => ({
        username: user.login,
        displayName: user.display_name,
        id: user.id,
        profile_image_url: user.profile_image_url,
      })),
    });
  } catch (error) {
    console.error('[Twitch Live API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}