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
    
    // CRITICAL FIX: Validate external API response structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data format from external API. Expected an object.');
    }
    
    if (!Array.isArray(data.players)) {
      throw new Error('Invalid data format from external API. Expected a "players" array.');
    }

    // Validate and sanitize player data before processing
    const playersToUpdate: ExternalPlayer[] = [];
    const invalidPlayers: string[] = [];

    for (const player of data.players) {
      // Check required fields
      if (!player || typeof player !== 'object') {
        invalidPlayers.push('object is null or not an object');
        continue;
      }
      
      if (typeof player.id !== 'string' || !player.id.trim()) {
        invalidPlayers.push(`player.id is required and must be string: ${player.id}`);
        continue;
      }
      
      if (typeof player.twitchUsername !== 'string' || !player.twitchUsername.trim()) {
        invalidPlayers.push(`player.twitchUsername is required and must be string: ${player.twitchUsername}`);
        continue;
      }

      // Sanitized player object
      playersToUpdate.push({
        id: player.id.trim(),
        twitchUsername: player.twitchUsername.trim(),
        avatarUrl: typeof player.avatarUrl === 'string' ? player.avatarUrl.trim() : '',
        isActive: player.isActive === true,
        score: typeof player.score === 'number' ? Math.max(0, player.score) : 0,
      });
    }

    if (invalidPlayers.length > 0) {
      console.warn(`[SyncCommunity] Skipped ${invalidPlayers.length} invalid players:`, invalidPlayers.slice(0, 5));
    }

    if (playersToUpdate.length === 0) {
      throw new Error('No valid players in external API response');
    }

    await updateAppState((state) => {
      const activePlayerIds = new Set(playersToUpdate.map((p) => p.id));

      // Mark players as inactive if they're not in the external list
      for (const player of Object.values(state.users || {}) as any[]) {
        if (player?.isActive && !activePlayerIds.has(player.id)) {
          player.isActive = false;
        }
      }

      // Upsert synced players
      state.users = state.users || {};
      for (const player of playersToUpdate) {
        const existing = state.users[player.id] || {};
        state.users[player.id] = {
          ...existing,
          id: player.id,
          twitchUsername: player.twitchUsername,
          avatarUrl: player.avatarUrl,
          isActive: player.isActive,
          communityPoints: player.score,
          score: existing.score ?? 0,
          isIt: existing.isIt ?? false,
        };
      }
    });

    return NextResponse.json({
      players: playersToUpdate,
      syncedFrom: 'external',
      message: `Successfully synchronized ${playersToUpdate.length} players.${invalidPlayers.length > 0 ? ` (Skipped ${invalidPlayers.length} invalid records)` : ''}`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: `Community sync failed. Last error: ${error.message}` }, { status: 500 });
  }
}