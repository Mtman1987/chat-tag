import { NextResponse } from 'next/server';
import { updateAppState } from '@/lib/volume-store';
import { lookupTwitchUsers } from '@/lib/twitch';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // Pre-fetch all players that need avatar or ID resolution
    const { readAppState } = await import('@/lib/volume-store');
    const preState = await readAppState();
    const allPlayers = Object.entries(preState.tagPlayers) as [string, any][];
    const needWork = allPlayers.filter(([k, p]) => !p.avatarUrl || p.avatarUrl === '' || k.startsWith('manual_'));
    const logins = [...new Set(needWork.map(([, p]) => (p.twitchUsername || '').toLowerCase()).filter(Boolean))];

    // Batch lookup via shared helper
    const twitchUsers = await lookupTwitchUsers(logins);
    const twitchByLogin = new Map(twitchUsers.map(u => [u.login.toLowerCase(), u]));

    const result = await updateAppState((state) => {
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

      // 2. Apply fetched avatars + resolve remaining manual_ IDs
      for (const [key, player] of Object.entries(state.tagPlayers) as [string, any][]) {
        const login = (player.twitchUsername || '').toLowerCase();
        const twitchUser = twitchByLogin.get(login);
        if (!twitchUser) continue;

        if (!player.avatarUrl || player.avatarUrl === '') {
          player.avatarUrl = twitchUser.profile_image_url;
          stats.avatarsFetched++;
        }

        // Migrate manual_ to real user_ ID
        if (key.startsWith('manual_')) {
          const realId = `user_${twitchUser.id}`;
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
