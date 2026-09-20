import { NextRequest, NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';
import { GAME_HUB_CATALOG } from '@/lib/game-hub-registry';
import { canonicalPlayerCommands, canonicalStreamerCommands } from '@/lib/game-hub-commands';
import { normalizeGameOverlayProfile } from '@/lib/game-hub-overlays';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ profileId: string }> },
) {
  const { profileId } = await context.params;
  const id = String(profileId || '').trim();
  if (!id) return NextResponse.json({ error: 'Overlay id is required.' }, { status: 400 });

  const state = await readAppState();
  const systemProfiles: Record<string, { name: string; gameIds: string[]; layout: 'focus' | 'rotation' }> = {
    'system-spacemountainlive-main': {
      name: 'SpaceMountainLive Nebula Stage',
      gameIds: ['wordchain', 'phraseguess'],
      layout: 'rotation',
    },
    'system-spacemountainlive-rain': {
      name: 'SpaceMountainLive Emoji Rain',
      gameIds: ['emojirain'],
      layout: 'focus',
    },
    'system-spacemountainlive-parade': {
      name: 'SpaceMountainLive Dancing Parade',
      gameIds: ['dancingparade'],
      layout: 'focus',
    },
  };

  const system = systemProfiles[id];
  const store = (state.gameSettings.default?.gameHubOverlayProfiles || {}) as Record<string, any>;
  const profile = system ? {
    id,
    ownerUserId: 'spacemountainlive',
    ownerLogin: 'spacemountainlive',
    name: system.name,
    gameIds: system.gameIds,
    layout: system.layout,
    transparent: true,
    createdAt: 'system',
    updatedAt: 'system',
  } : normalizeGameOverlayProfile(store[id]);
  if (!profile) return NextResponse.json({ error: 'Overlay was not found.' }, { status: 404 });

  const games = profile.gameIds
    .map((gameId) => GAME_HUB_CATALOG.find((game) => game.id === gameId))
    .filter(Boolean)
    .map((game) => ({
      id: game!.id,
      name: game!.name,
      shortName: game!.shortName,
      runtime: game!.runtime,
      commands: canonicalPlayerCommands(game!),
      streamerCommands: canonicalStreamerCommands(game!),
      chatSignals: game!.chatSignals || [],
    }));

  return NextResponse.json({
    profile: {
      id: profile.id,
      name: profile.name,
      ownerUserId: profile.ownerUserId,
      ownerLogin: profile.ownerLogin,
      gameIds: profile.gameIds,
      layout: profile.layout,
      transparent: profile.transparent,
      updatedAt: profile.updatedAt,
    },
    games,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
