import { NextRequest, NextResponse } from 'next/server';
import { updateAppState } from '@/lib/volume-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const syncAll = body.syncAll === true;

    const result = await updateAppState((state) => {
      let fixedCase = 0;
      let addedToChannels = 0;
      let addedToPlayers = 0;

      const playerUsernames = new Set<string>();
      const channelNames = new Set(Object.keys(state.botChannels));

      // 1. Normalize all player usernames to lowercase
      for (const player of Object.values(state.tagPlayers) as any[]) {
        const current = player.twitchUsername || '';
        const lower = current.toLowerCase();

        if (current !== lower) {
          player.twitchUsername = lower;
          fixedCase++;
        }

        playerUsernames.add(lower);

        // 2. Ensure every player is in botChannels
        if (lower && !state.botChannels[lower]) {
          state.botChannels[lower] = {
            name: lower,
            status: 'joined',
            lastUpdated: new Date().toISOString(),
          };
          addedToChannels++;
        }
      }

      // 3. If syncAll, add botChannels that aren't players as players too
      if (syncAll) {
        for (const channelName of channelNames) {
          if (!playerUsernames.has(channelName)) {
            const id = `channel_${channelName}`;
            if (!state.tagPlayers[id]) {
              state.tagPlayers[id] = {
                id,
                twitchUsername: channelName,
                avatarUrl: '',
                score: 0,
                tags: 0,
                tagged: 0,
                isIt: false,
                isActive: false,
                isPlayer: true,
              };
              addedToPlayers++;
            }
          }
        }
      }

      // Build mismatch report
      const playersNotInChannels: string[] = [];
      const channelsNotInPlayers: string[] = [];

      for (const username of playerUsernames) {
        if (username && !state.botChannels[username]) {
          playersNotInChannels.push(username);
        }
      }

      for (const channelName of channelNames) {
        if (!playerUsernames.has(channelName)) {
          channelsNotInPlayers.push(channelName);
        }
      }

      return {
        fixedCase,
        addedToChannels,
        addedToPlayers,
        totalPlayers: Object.keys(state.tagPlayers).length,
        totalChannels: Object.keys(state.botChannels).length,
        playersNotInChannels,
        channelsNotInPlayers: channelsNotInPlayers.sort(),
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
