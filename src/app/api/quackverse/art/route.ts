import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { requireAdminRequest } from '@/lib/auth';
import { dataDirPath, readAppState, updateAppState } from '@/lib/volume-store';
import {
  normalizeQuackverseArtManifest,
  type QuackverseArtAsset,
  type QuackverseArtEntry,
  type QuackverseArtManifest,
  type QuackverseArtVariant,
  quackverseArtFileUrl,
} from '@/lib/quackverse-art';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ART_ROOT = path.join(dataDirPath(), 'quackverse-card-art');
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

function manifestFromState(state: any): QuackverseArtManifest {
  return normalizeQuackverseArtManifest(state?.gameSettings?.default?.quackverseArt);
}

function withPublicUrls(manifest: QuackverseArtManifest) {
  const cards: Record<string, Record<QuackverseArtVariant, any>> = {};
  for (const [cardId, entry] of Object.entries(manifest)) {
    const numericCardId = Number(cardId);
    if (!Number.isFinite(numericCardId)) continue;
    cards[cardId] = {
      static: entry.static
        ? {
            ...entry.static,
            url: quackverseArtFileUrl(numericCardId, 'static', entry.static.updatedAt),
          }
        : null,
      hover: entry.hover
        ? {
            ...entry.hover,
            url: quackverseArtFileUrl(numericCardId, 'hover', entry.hover.updatedAt),
          }
        : null,
    } as any;
  }
  return cards;
}

async function removeIfExists(filePath: string) {
  await fs.rm(filePath, { force: true }).catch(() => {});
}

export async function GET(req: NextRequest) {
  const appState = await readAppState();
  const manifest = manifestFromState(appState);
  return NextResponse.json({
    cards: withPublicUrls(manifest),
  });
}

export async function POST(req: NextRequest) {
  const auth = requireAdminRequest(req);
  if (!auth.ok) return auth.response;

  const formData = await req.formData();
  const cardId = Number(formData.get('cardId'));
  const variant = String(formData.get('variant') || '') as QuackverseArtVariant;
  const file = formData.get('file');

  if (!Number.isFinite(cardId) || cardId < 1) {
    return NextResponse.json({ error: 'cardId is required.' }, { status: 400 });
  }
  if (variant !== 'static' && variant !== 'hover') {
    return NextResponse.json({ error: 'variant must be static or hover.' }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required.' }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES[file.type]) {
    return NextResponse.json({ error: 'Unsupported file type.' }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Max 20MB.' }, { status: 413 });
  }

  await fs.mkdir(path.join(ART_ROOT, String(cardId)), { recursive: true });

  const fileName = `${variant}.${ALLOWED_MIME_TYPES[file.type]}`;
  const relativePath = path.join(String(cardId), fileName);
  const absolutePath = path.join(ART_ROOT, relativePath);

  const existing = await readAppState();
  const previous = manifestFromState(existing)[String(cardId)]?.[variant];
  if (previous?.fileName && previous.fileName !== fileName) {
    await removeIfExists(path.join(ART_ROOT, String(cardId), previous.fileName));
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(absolutePath, bytes);

  const asset: QuackverseArtAsset = {
    fileName: relativePath.replace(/\\/g, '/'),
    mimeType: file.type,
    originalName: file.name || fileName,
    updatedAt: new Date().toISOString(),
  };

  await updateAppState((state) => {
    if (!state.gameSettings.default) state.gameSettings.default = {};
    const current = normalizeQuackverseArtManifest(state.gameSettings.default.quackverseArt);
    const entry: QuackverseArtEntry = current[String(cardId)] || {};
    entry[variant] = asset;
    state.gameSettings.default.quackverseArt = {
      ...current,
      [String(cardId)]: entry,
    };
    return state.gameSettings.default.quackverseArt;
  });

  return NextResponse.json({
    success: true,
    cardId,
    variant,
    asset: {
      ...asset,
      url: quackverseArtFileUrl(cardId, variant, asset.updatedAt),
    },
  });
}
