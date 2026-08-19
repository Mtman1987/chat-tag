import { NextResponse } from 'next/server';
import { getGameHubGame } from '@/lib/game-hub-registry';
import { getCanonicalGameCommandSpec } from '@/lib/game-hub-commands';
import { getGameHubStore, resolveChannelGameIds } from '@/lib/game-hub-state';
import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const state = await readAppState();
  const store = getGameHubStore(state);
  const configuredChannels = new Set<string>(Object.keys(store.channels || {}));
  const profiles = (state.gameSettings?.default?.gameHubOverlayProfiles || {}) as Record<string, any>;
  for (const profile of Object.values(profiles)) {
    const channel = String(profile?.ownerLogin || '').trim().toLowerCase().replace(/^#/, '');
    if (channel) configuredChannels.add(channel);
  }

  const activeScopes = [...configuredChannels]
    .map((channel) => {
      const gameIds = resolveChannelGameIds(state, channel);
      return {
        channel,
        games: gameIds.map((gameId) => {
          const game = getGameHubGame(gameId);
          return game ? {
            id: game.id,
            name: game.name,
            command: `spmt ${getCanonicalGameCommandSpec(game)?.key || game.id}`,
          } : null;
        }).filter(Boolean),
      };
    })
    .filter((scope) => scope.games.length > 0)
    .sort((a, b) => a.channel.localeCompare(b.channel));

  const recentPlayers = Object.values(store.players || {})
    .flatMap((player) => Object.entries(player.joinedGames || {}).map(([gameId, membership]: [string, any]) => {
      const game = getGameHubGame(gameId);
      if (!game || !membership?.lastActiveAt) return null;
      return {
        id: `${player.id}:${gameId}`,
        playerId: player.id,
        username: player.username,
        displayName: player.displayName,
        gameId,
        gameName: game.name,
        score: Number(membership.score || 0),
        wins: Number(membership.wins || 0),
        plays: Number(membership.plays || 0),
        joinedAt: membership.joinedAt,
        lastActiveAt: membership.lastActiveAt,
        gamePointsBalance: Number(player.gamePointsBalance || 0),
        lifetimeEarned: Number(player.lifetimeEarned || 0),
      };
    }))
    .filter(Boolean)
    .sort((a: any, b: any) => String(b.lastActiveAt).localeCompare(String(a.lastActiveAt)))
    .slice(0, 20);

  return NextResponse.json({ activeScopes, recentPlayers });
}
