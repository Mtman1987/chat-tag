import { NextRequest, NextResponse } from 'next/server';
import { updateAppState } from '@/lib/volume-store';

type ExternalPlayer = {
  id: string;
  twitchUsername: string;
  avatarUrl: string;
  isActive: boolean;
  score?: number;
};

export async function POST(req: NextRequest) {
  const { externalApiUrl } = await req.json();

  if (!externalApiUrl) {
    return NextResponse.json(
      { error: 'External API URL is not configured. Community sync cannot proceed.' },
      { status: 400 }
    );
  }

  try {
    const externalApiResponse = await fetch(externalApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({}),
      cache: 'no-store',
    });

    if (!externalApiResponse.ok) {
      throw new Error(`External API returned status: ${externalApiResponse.status} ${externalApiResponse.statusText}`);
    }

    const data = await externalApiResponse.json();
    if (!data.players) {
      throw new Error('Invalid data format from external API. Expected a "players" array.');
    }

    const playersToUpdate: ExternalPlayer[] = data.players;

    await updateAppState((state) => {
      const activePlayerIds = new Set(playersToUpdate.map((p) => p.id));

      for (const player of Object.values(state.users) as any[]) {
        if (player.isActive && !activePlayerIds.has(player.id)) {
          player.isActive = false;
        }
      }

      for (const player of playersToUpdate) {
        const existing = state.users[player.id] || {};
        state.users[player.id] = {
          ...existing,
          id: player.id,
          twitchUsername: player.twitchUsername,
          avatarUrl: player.avatarUrl,
          isActive: player.isActive,
          communityPoints: player.score ?? 0,
          score: existing.score ?? 0,
          isIt: existing.isIt ?? false,
        };
      }
    });

    return NextResponse.json({
      players: playersToUpdate,
      syncedFrom: 'external',
      message: `Successfully synchronized ${playersToUpdate.length} players.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: `Community sync failed. Last error: ${error.message}` }, { status: 500 });
  }
}