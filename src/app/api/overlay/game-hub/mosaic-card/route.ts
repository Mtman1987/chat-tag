import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { readAppState } from '@/lib/volume-store';
import { mosaicPublicSnapshot } from '@/lib/nebula-mosaic';
export const dynamic = 'force-dynamic';
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!));
export async function GET(req: NextRequest) {
  const channel = String(req.nextUrl.searchParams.get('channel') || '').toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(channel)) return NextResponse.json({ error: 'Invalid channel.' }, { status: 400 });
  const art = mosaicPublicSnapshot(structuredClone(await readAppState()), channel).artwork;
  if (!art) return NextResponse.json({ error: 'No Mosaic loaded.' }, { status: 404 });
  const cell = 28, x0 = 50, y0 = 108;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="840" viewBox="0 0 640 840"><rect width="640" height="840" fill="#071225"/><g font-family="sans-serif" text-anchor="middle"><text x="320" y="30" fill="#ffffff" font-size="22" font-weight="bold">${escape(art.theme.slice(0, 40))}</text><text x="320" y="57" fill="#a5f3fc" font-size="16">Board ${art.activeBoard} · ${art.progress}/${art.total} correct</text>`];
  for (let column = 0; column < 20; column++) parts.push(`<text x="${x0 + column * cell + cell / 2}" y="94" fill="#cffafe" font-size="14" font-weight="bold">${String.fromCharCode(65 + column)}</text>`);
  for (let row = 0; row < 25; row++) {
    parts.push(`<text x="28" y="${y0 + row * cell + 19}" fill="#cffafe" font-size="14" font-weight="bold">${row + 1}</text>`);
    for (let column = 0; column < 20; column++) {
      const index = art.width > 20 ? (Math.floor((art.activeBoard - 1) / 2) * 25 + row) * art.width + ((art.activeBoard - 1) % 2) * 20 + column : row * art.width + column;
      const target = art.target[index], painted = art.painted[index];
      const paletteColor = art.palette[painted || target];
      const color = /^#[0-9a-f]{6}$/i.test(paletteColor || '') ? paletteColor : '#94a3b8';
      const x = x0 + column * cell, y = y0 + row * cell;
      parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${painted ? color : '#020617'}" stroke="#334155" stroke-width="0.6"/>`);
      if (!painted) parts.push(`<text x="${x + cell / 2}" y="${y + 19}" fill="${target === 'K' ? '#94a3b8' : color}" font-size="13" font-weight="bold">${escape(target)}</text>`);
    }
  }
  parts.push('</g></svg>');
  const png = await sharp(Buffer.from(parts.join(''))).png().toBuffer();
  return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=20' } });
}
