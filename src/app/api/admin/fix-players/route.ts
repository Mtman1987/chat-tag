import { NextResponse } from 'next/server';
import { updateAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const clientId = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID || process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Missing Twitch credentials' }, { status: 500 });
    }

    // Get app access token
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    });
    const { access_token } = await tokenRes.json();
    const headers = { 'Client-ID': clientId, 'Authorization': `Bearer ${access_token}` };

    const result = await updateAppState(async (state) => {
      const stats = { mergedDupes: 0, avatarsFetched: 0, channelsAdded: 0, errors: [] as string[] };

      // 1. Merge manual_ duplicates into their real user_ entries
      const manualKeys = Object.keys(state.tagPlayers).filter(k => k.startsWith('manual_'));
      for (const manualKey of manualKeys) {
        const manual = state.tagPlayers[manualKey];
        const username = (manual.twitchUsername || manualKey.replace('manual_', '')).toLowerCase();

        const realKey = Object.keys(state.tagPlayers).find(k =>
          k.startsWith('user_') && (state.tagPlayers[k].twitchUsername || '').toLowerCase() === username
        );

        if (realKey) {
          if (manual.isIt) {
            for (const p of Object.values(state.tagPlayers) as any[]) p.isIt = false;
            state.tagPlayers[realKey].isIt = true;
            if (state.tagGame?.state) state.tagGame.state.currentIt = realKey;
          }
          if ((manual.score || 0) > (state.tagPlayers[realKey].score || 0)) {
            state.tagPlayers[realKey].score = manual.score;
          }
          delete state.tagPlayers[manualKey];
          stats.mergedDupes++;

          for (const h of state.tagHistory) {
            if (h.taggerId === manualKey) h.taggerId = realKey;
            if (h.taggedId === manualKey) h.taggedId = realKey;
          }
          for (const t of state.chatTags || []) {
            if (t.taggerId === manualKey) t.taggerId = realKey;
            if (t.taggedId === manualKey) t.taggedId = realKey;
          }
        }
      }

      // 2. Fetch missing avatars + resolve manual_ IDs in batches
      const allPlayers = Object.entries(state.tagPlayers) as [string, any][];
      const needWork = allPlayers.filter(([k, p]) => !p.avatarUrl || p.avatarUrl === '' || k.startsWith('manual_'));
      const logins = needWork.map(([, p]) => (p.twitchUsername || '').toLowerCase()).filter(Boolean);
      const unique = [...new Set(logins)];

      for (let i = 0; i < unique.length; i += 100) {
        const batch = unique.slice(i, i + 100);
        const query = batch.map(l => `login=${encodeURIComponent(l)}`).join('&');
        try {
          const res = await fetch(`https://api.twitch.tv/helix/users?${query}`, { headers });
          if (res.ok) {
            const data = await res.json();
            for (const user of data.data || []) {
              const login = user.login.toLowerCase();
              // Update avatar on any matching player
              for (const [key, player] of Object.entries(state.tagPlayers) as [string, any][]) {
                if ((player.twitchUsername || '').toLowerCase() !== login) continue;
                if (!player.avatarUrl || player.avatarUrl === '') {
                  player.avatarUrl = user.profile_image_url;
                  stats.avatarsFetched++;
                }
                // Migrate manual_ to real user_ ID
                if (key.startsWith('manual_')) {
                  const realId = `user_${user.id}`;
                  if (!state.tagPlayers[realId]) {
                    player.id = realId;
                    state.tagPlayers[realId] = player;
                    delete state.tagPlayers[key];
                    if (state.tagGame?.state?.currentIt === key) {
                      state.tagGame.state.currentIt = realId;
                    }
                    for (const h of state.tagHistory) {
                      if (h.taggerId === key) h.taggerId = realId;
                      if (h.taggedId === key) h.taggedId = realId;
                    }
                    stats.mergedDupes++;
                  }
                }
              }
            }
          }
        } catch (e: any) {
          stats.errors.push(`Batch ${i}: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 200));
      }

      // 3. Ensure all players are in bot channels
      for (const player of Object.values(state.tagPlayers) as any[]) {
        const username = (player.twitchUsername || '').toLowerCase();
        if (!username) continue;
        if (!state.botChannels[username]) {
          state.botChannels[username] = { name: username, status: 'joined', lastUpdated: new Date().toISOString() };
          stats.channelsAdded++;
        }
      }

      return stats;
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
