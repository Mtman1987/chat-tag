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

type UploadFileRecord = {
  name?: string;
  fileName?: string;
  type?: string;
  mimeType?: string;
  data?: string;
  base64?: string;
  content?: string;
  bytes?: number[];
};

type UploadPayload = {
  cardId?: unknown;
  variant?: unknown;
  file?: unknown;
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

async function readUploadPayload(req: NextRequest): Promise<{ ok: true; data: UploadPayload } | { ok: false; response: Response }> {
  const contentType = req.headers.get('content-type') || '';

  if (
    contentType.includes('multipart/form-data') ||
    contentType.includes('application/x-www-form-urlencoded')
  ) {
    const formData = await req.formData();
    return {
      ok: true,
      data: {
        cardId: formData.get('cardId'),
        variant: formData.get('variant'),
        file: formData.get('file'),
      },
    };
  }

  const rawBody = await req.text().catch(() => '');
  if (!rawBody.trim()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Content-Type must be multipart/form-data or application/json.' },
        { status: 415 }
      ),
    };
  }

  try {
    const parsed = JSON.parse(rawBody);
    return { ok: true, data: parsed as UploadPayload };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Content-Type must be multipart/form-data or application/json.' },
        { status: 415 }
      ),
    };
  }
}

function decodeBase64Payload(value: string): { bytes: Buffer; mimeType: string } {
  const match = String(value || '').trim().match(/^data:([^;,]+)?;base64,(.+)$/i);
  if (match) {
    return {
      mimeType: match[1] || '',
      bytes: Buffer.from(match[2], 'base64'),
    };
  }
  return {
    mimeType: '',
    bytes: Buffer.from(String(value || '').trim(), 'base64'),
  };
}

async function normalizeUploadFile(file: unknown): Promise<{ bytes: Buffer; mimeType: string; originalName: string } | null> {
  if (file instanceof File) {
    return {
      bytes: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type,
      originalName: file.name || 'upload.bin',
    };
  }

  if (typeof file === 'string') {
    const decoded = decodeBase64Payload(file);
    return {
      bytes: decoded.bytes,
      mimeType: decoded.mimeType,
      originalName: 'upload.bin',
    };
  }

  if (!file || typeof file !== 'object') return null;

  const record = file as UploadFileRecord;
  const originalName = record.fileName || record.name || 'upload.bin';
  const explicitMimeType = String(record.mimeType || record.type || '').trim();

  if (Array.isArray(record.bytes)) {
    return {
      bytes: Buffer.from(record.bytes),
      mimeType: explicitMimeType,
      originalName,
    };
  }

  const encoded = record.data || record.base64 || record.content;
  if (typeof encoded === 'string' && encoded.trim()) {
    const decoded = decodeBase64Payload(encoded);
    return {
      bytes: decoded.bytes,
      mimeType: explicitMimeType || decoded.mimeType,
      originalName,
    };
  }

  return null;
}

export async function GET() {
  const appState = await readAppState();
  const manifest = manifestFromState(appState);
  return NextResponse.json({
    cards: withPublicUrls(manifest),
  });
}

export async function POST(req: NextRequest) {
  const auth = requireAdminRequest(req);
  if (!auth.ok) return auth.response;

  const payload = await readUploadPayload(req);
  if (!payload.ok) return payload.response;

  const cardId = Number(payload.data.cardId);
  const variant = String(payload.data.variant || '') as QuackverseArtVariant;
  const file = await normalizeUploadFile(payload.data.file);

  if (!Number.isFinite(cardId) || cardId < 1) {
    return NextResponse.json({ error: 'cardId is required.' }, { status: 400 });
  }
  if (variant !== 'static' && variant !== 'hover') {
    return NextResponse.json({ error: 'variant must be static or hover.' }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: 'file is required.' }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES[file.mimeType]) {
    return NextResponse.json({ error: 'Unsupported file type.' }, { status: 400 });
  }
  if (file.bytes.length <= 0) {
    return NextResponse.json({ error: 'File is empty. Please upload the image again.' }, { status: 400 });
  }
  if (file.bytes.length > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Max 20MB.' }, { status: 413 });
  }

  await fs.mkdir(path.join(ART_ROOT, String(cardId)), { recursive: true });

  const fileName = `${variant}.${ALLOWED_MIME_TYPES[file.mimeType]}`;
  const relativePath = path.join(String(cardId), fileName);
  const absolutePath = path.join(ART_ROOT, relativePath);

  const existing = await readAppState();
  const previous = manifestFromState(existing)[String(cardId)]?.[variant];
  if (previous?.fileName && previous.fileName !== fileName) {
    await removeIfExists(path.join(ART_ROOT, String(cardId), previous.fileName));
  }

  await fs.writeFile(absolutePath, file.bytes);

  const asset: QuackverseArtAsset = {
    fileName: relativePath.replace(/\\/g, '/'),
    mimeType: file.mimeType,
    originalName: file.originalName || fileName,
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
