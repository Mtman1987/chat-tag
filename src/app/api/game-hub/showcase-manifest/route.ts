import { NextRequest, NextResponse } from 'next/server';
import { GAME_HUB_CATALOG } from '@/lib/game-hub-registry';
import { getPublicAppOrigin } from '@/lib/public-origin';
import {
  NEBULA_GAMEPLAY_CAPTURE_SECONDS,
  NEBULA_GAMEPLAY_REVISION,
  NEBULA_GAMEPLAY_ROTATION_SECONDS,
} from '@/lib/nebula-gameplay-config';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const origin = getPublicAppOrigin() || request.nextUrl.origin;
  const fallbackImageUrl = new URL('/brand/nebula-arcade-games-showcase.gif?v=2', origin).toString();
  const games = GAME_HUB_CATALOG.map((game, order) => ({
    id: game.id,
    name: game.name,
    order,
    revision: NEBULA_GAMEPLAY_REVISION,
    captureSeconds: NEBULA_GAMEPLAY_CAPTURE_SECONDS,
    captureUrl: new URL(`/overlay/game-hub/showcase/${encodeURIComponent(game.id)}`, origin).toString(),
  }));

  return NextResponse.json({
    revision: NEBULA_GAMEPLAY_REVISION,
    captureSeconds: NEBULA_GAMEPLAY_CAPTURE_SECONDS,
    rotationSeconds: NEBULA_GAMEPLAY_ROTATION_SECONDS,
    fallbackImageUrl,
    games,
  }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=300' },
  });
}
