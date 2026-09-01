import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { requireAdminRequest } from '@/lib/auth';
import { quackverseCards } from '@/lib/quackverse-data';
import { normalizeQuackverseArtManifest, type QuackverseArtAsset, type QuackverseArtEntry } from '@/lib/quackverse-art';
import { getBotSecret } from '@/lib/runtime-secrets';
import { dataDirPath, readAppState, updateAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ART_ROOT = path.join(dataDirPath(), 'quackverse-card-art');
const DSH_URL = (process.env.DISCORD_STREAM_HUB_URL || process.env.DSH_URL || 'https://discord-stream-hub-new.fly.dev').replace(/\/$/, '');
const MAX_RENDERED_BYTES = 50 * 1024 * 1024;

function artPath(fileName: string) {
  const root = path.resolve(ART_ROOT);
  const full = path.resolve(ART_ROOT, String(fileName || '').replace(/^[/\\]+/, ''));
  if (!full.startsWith(`${root}${path.sep}`)) throw new Error('Invalid Quackverse art path');
  return full;
}

function decodeRenderedAsset(value: unknown, label: string) {
  const encoded = String(value || '').trim();
  if (!encoded) throw new Error(`${label} renderer output was empty`);
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length) throw new Error(`${label} renderer output was empty`);
  if (bytes.length > MAX_RENDERED_BYTES) throw new Error(`${label} renderer output exceeded 50MB`);
  return bytes;
}

async function removePrevious(asset?: QuackverseArtAsset | null, keepRelative?: string) {
  if (!asset?.fileName || asset.fileName === keepRelative) return;
  await fs.rm(artPath(asset.fileName), { force: true }).catch(() => {});
}

export async function POST(request: NextRequest) {
  const auth = requireAdminRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const cardId = Number(body?.cardId);
    if (!Number.isFinite(cardId) || !quackverseCards.some((card) => card.id === cardId)) {
      return NextResponse.json({ error: 'A valid Quackverse cardId is required.' }, { status: 400 });
    }

    const state = await readAppState();
    const manifest = normalizeQuackverseArtManifest(state?.gameSettings?.default?.quackverseArt);
    const entry = manifest[String(cardId)] || {};
    if (!entry.static?.fileName) {
      return NextResponse.json({ error: 'This card needs static art before it can be enhanced and animated.' }, { status: 409 });
    }

    const source = await fs.readFile(artPath(entry.static.fileName));
    if (!source.length) throw new Error('Static art file is empty');
    if (source.length > MAX_RENDERED_BYTES) throw new Error('Static art file exceeds 50MB');

    const renderResponse = await fetch(`${DSH_URL}/api/internal/quackverse/art-render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getBotSecret()}`,
      },
      body: JSON.stringify({
        cardId,
        imageBase64: source.toString('base64'),
        sourceMimeType: entry.static.mimeType || 'image/png',
      }),
    });
    const rendered = await renderResponse.json().catch(() => null);
    if (!renderResponse.ok || !rendered?.success) {
      throw new Error(rendered?.error || `DSH art renderer failed (${renderResponse.status})`);
    }

    const staticBytes = decodeRenderedAsset(rendered?.static?.base64, 'Enhanced static');
    const hoverBytes = decodeRenderedAsset(rendered?.hover?.base64, 'Hover GIF');
    const cardDir = path.join(ART_ROOT, String(cardId));
    await fs.mkdir(cardDir, { recursive: true });

    const staticRelative = `${cardId}/static.webp`;
    const hoverRelative = `${cardId}/hover.gif`;
    await fs.writeFile(path.join(ART_ROOT, staticRelative), staticBytes);
    await fs.writeFile(path.join(ART_ROOT, hoverRelative), hoverBytes);
    await removePrevious(entry.static, staticRelative);
    await removePrevious(entry.hover, hoverRelative);

    const now = new Date().toISOString();
    const enhancedStatic: QuackverseArtAsset = {
      fileName: staticRelative,
      mimeType: 'image/webp',
      originalName: `dsh-enhanced-card-${String(cardId).padStart(3, '0')}.webp`,
      updatedAt: now,
    };
    const hover: QuackverseArtAsset = {
      fileName: hoverRelative,
      mimeType: 'image/gif',
      originalName: `dsh-loop-card-${String(cardId).padStart(3, '0')}.gif`,
      updatedAt: now,
    };

    await updateAppState((nextState) => {
      if (!nextState.gameSettings.default) nextState.gameSettings.default = {};
      const current = normalizeQuackverseArtManifest(nextState.gameSettings.default.quackverseArt);
      const currentEntry: QuackverseArtEntry = current[String(cardId)] || {};
      currentEntry.static = enhancedStatic;
      currentEntry.hover = hover;
      nextState.gameSettings.default.quackverseArt = { ...current, [String(cardId)]: currentEntry };
      return nextState.gameSettings.default.quackverseArt;
    });

    return NextResponse.json({
      success: true,
      cardId,
      renderer: rendered.renderer || 'dsh-sharp-ffmpeg',
      static: { ...enhancedStatic, width: rendered?.static?.width, height: rendered?.static?.height },
      hover: {
        ...hover,
        width: rendered?.hover?.width,
        height: rendered?.hover?.height,
        fps: rendered?.hover?.fps,
        durationSeconds: rendered?.hover?.durationSeconds,
        frameCount: rendered?.hover?.frameCount,
        firstAndLastFrameMatch: rendered?.hover?.firstAndLastFrameMatch === true,
      },
    });
  } catch (error: any) {
    console.error('[QuackverseEnhanceAnimate] Failed:', error);
    return NextResponse.json({ error: error?.message || 'Enhance + Animate failed' }, { status: 500 });
  }
}
