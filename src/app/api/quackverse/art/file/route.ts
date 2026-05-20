import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { readAppState } from '@/lib/volume-store';
import { normalizeQuackverseArtManifest, type QuackverseArtVariant } from '@/lib/quackverse-art';
import { dataDirPath } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ART_ROOT = path.join(dataDirPath(), 'quackverse-card-art');

export async function GET(req: NextRequest) {
  const cardId = Number(req.nextUrl.searchParams.get('cardId'));
  const variant = String(req.nextUrl.searchParams.get('variant') || '') as QuackverseArtVariant;

  if (!Number.isFinite(cardId) || cardId < 1) {
    return NextResponse.json({ error: 'cardId is required.' }, { status: 400 });
  }
  if (variant !== 'static' && variant !== 'hover') {
    return NextResponse.json({ error: 'variant is required.' }, { status: 400 });
  }

  const state = await readAppState();
  const manifest = normalizeQuackverseArtManifest(state?.gameSettings?.default?.quackverseArt);
  const asset = manifest[String(cardId)]?.[variant];
  if (!asset) {
    return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });
  }

  const filePath = path.join(ART_ROOT, asset.fileName);
  try {
    const buffer = await fs.readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': asset.mimeType,
        'Cache-Control': 'public, max-age=60, must-revalidate',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Asset file missing.' }, { status: 404 });
  }
}
