import { NextRequest, NextResponse } from 'next/server';
import { readAppState } from '@/lib/volume-store';
import { mosaicPublicSnapshot } from '@/lib/nebula-mosaic';
import { normalizeGameHubChannel } from '@/lib/game-hub-state';

export const dynamic = 'force-dynamic';

function esc(value: unknown) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;' }[ch] || ch));
}

export async function GET(req: NextRequest) {
  const channel = normalizeGameHubChannel(req.nextUrl.searchParams.get('channel'));
  if (!channel) return new NextResponse('channel is required', { status: 400 });
  const state = await readAppState();
  const snapshot: any = mosaicPublicSnapshot(state, channel);
  const art = snapshot.artwork;
  if (!art || art.status !== 'completed') return new NextResponse('Mosaic is not complete yet.', { status: 409 });
  const palette = art.palette || {};
  const width = 800, height = 1000, cellW = width / 40, cellH = height / 50;
  const cells = art.target.map((code: string, index: number) => {
    const x = (index % 40) * cellW, y = Math.floor(index / 40) * cellH;
    return `<rect x="${x}" y="${y}" width="${cellW + .5}" height="${cellH + .5}" fill="${esc(palette[code] || '#111827')}"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(art.theme)} Nebula Mosaic"><rect width="100%" height="100%" fill="#020617"/>${cells}</svg>`;
  return new NextResponse(svg, { status: 200, headers: { 'content-type':'image/svg+xml; charset=utf-8', 'cache-control':'no-store', 'content-disposition':`inline; filename="nebula-mosaic-${encodeURIComponent(channel)}.svg"` } });
}
