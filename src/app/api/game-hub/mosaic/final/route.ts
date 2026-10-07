import { NextRequest, NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';
import { findMosaicArtwork, mosaicTemplate, mosaicTemplateSvg } from '@/lib/mosaic-projects';
import { normalizeGameHubChannel } from '@/lib/game-hub-state';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const channel = normalizeGameHubChannel(req.nextUrl.searchParams.get('channel'));
  if (!channel) return new NextResponse('channel is required', { status: 400 });
  const state = await readAppState();
  const art = findMosaicArtwork(state, channel, req.nextUrl.searchParams.get('artworkId'));
  if (!art || art.status !== 'completed') return new NextResponse('Mosaic is not complete yet.', { status: 409 });
  const svg = mosaicTemplateSvg(mosaicTemplate(art));
  return new NextResponse(svg, { status: 200, headers: { 'content-type':'image/svg+xml; charset=utf-8', 'cache-control':'no-store', 'content-disposition':`inline; filename="nebula-mosaic-${encodeURIComponent(channel)}.svg"` } });
}
