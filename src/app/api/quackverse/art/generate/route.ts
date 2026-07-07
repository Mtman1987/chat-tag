import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { requireAdminRequest } from '@/lib/auth';
import { quackverseCards } from '@/lib/quackverse-data';
import { dataDirPath, readAppState, updateAppState } from '@/lib/volume-store';
import {
  normalizeQuackverseArtManifest,
  quackverseArtFileUrl,
  type QuackverseArtAsset,
  type QuackverseArtEntry,
  type QuackverseArtVariant,
} from '@/lib/quackverse-art';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ART_ROOT = path.join(dataDirPath(), 'quackverse-card-art');
const STREAMWEAVER_URL = (process.env.STREAMWEAVER_URL || process.env.STREAMWEAVE_URL || 'https://streamweaver-new.fly.dev').replace(/\/$/, '');

function mimeToExt(mimeType: string) {
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  return 'png';
}

function buildPrompt(card: any, variant: QuackverseArtVariant) {
  const motion = variant === 'hover'
    ? 'dynamic animated key frame, motion trails, glowing energy, action pose, made for a hover GIF preview'
    : 'clean collectible card illustration, centered hero pose';
  return [
    `Quackverse duck trading card art for "${card.name}".`,
    `Type: ${card.type}. Role: ${card.role || 'cosmic duck adventurer'}. Rarity: ${card.rarity || 'Unknown'}.`,
    `Stats: ATK ${card.atk || 0}, DEF ${card.def || 0}, SPD ${card.spd || 0}, SPC ${card.spc || 0}, HP ${card.hp || 0}.`,
    card.effect ? `Ability theme: ${card.effect}.` : '',
    card.flavor ? `Flavor: ${card.flavor}.` : '',
    `${motion}, space fantasy, electric blue and violet highlights, crisp silhouette, no text, no watermark, no UI.`,
  ].filter(Boolean).join(' ');
}

async function callStreamWeaverImage(prompt: string, body: any) {
  const response = await fetch(`${STREAMWEAVER_URL}/api/ai/image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mountainview-bridge': '1',
    },
    body: JSON.stringify({
      prompt,
      providerOverride: 'seaart',
      scope: 'public',
      tenantId: body.tenantId || body.streamweaverTenantId || undefined,
      resolution: body.resolution || '1024x1024',
      numImages: 1,
      model: body.model || undefined,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `StreamWeaver image generation failed (${response.status})`);
  }
  const imageUrl = [
    ...(Array.isArray(data?.images) ? data.images : []),
    data?.image,
    data?.persistedImageUrl,
    data?.imageResourceUrl,
  ].map((value) => String(value || '').trim()).find(Boolean);
  if (!imageUrl) throw new Error('StreamWeaver did not return an image URL.');
  return imageUrl;
}

async function fetchGeneratedImage(imageUrl: string) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Could not download generated image (${response.status})`);
  const mimeType = String(response.headers.get('content-type') || 'image/png').split(';')[0].toLowerCase();
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error('Generated image was empty.');
  return { bytes, mimeType };
}

async function persistGeneratedArt(cardId: number, variant: QuackverseArtVariant, bytes: Buffer, mimeType: string) {
  await fs.mkdir(path.join(ART_ROOT, String(cardId)), { recursive: true });
  const fileName = `${variant}.${mimeToExt(mimeType)}`;
  const relativePath = `${cardId}/${fileName}`;
  await fs.writeFile(path.join(ART_ROOT, relativePath), bytes);
  const asset: QuackverseArtAsset = {
    fileName: relativePath,
    mimeType,
    originalName: `streamweaver-seaart-${cardId}-${variant}.${mimeToExt(mimeType)}`,
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
  return {
    ...asset,
    url: quackverseArtFileUrl(cardId, variant, asset.updatedAt),
  };
}

export async function POST(req: NextRequest) {
  const auth = requireAdminRequest(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const variant = String(body?.variant || 'static') as QuackverseArtVariant;
  if (variant !== 'static' && variant !== 'hover') {
    return NextResponse.json({ error: 'variant must be static or hover.' }, { status: 400 });
  }

  const limit = Math.max(1, Math.min(20, Number(body?.limit || 1) || 1));
  const missingOnly = body?.missingOnly !== false;
  const requestedIds = Array.isArray(body?.cardIds)
    ? body.cardIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id))
    : [];

  const state = await readAppState();
  const manifest = normalizeQuackverseArtManifest(state?.gameSettings?.default?.quackverseArt);
  const candidates = quackverseCards
    .filter((card) => requestedIds.length === 0 || requestedIds.includes(card.id))
    .filter((card) => !missingOnly || !manifest[String(card.id)]?.[variant])
    .slice(0, limit);

  const results = [];
  for (const card of candidates) {
    try {
      const prompt = buildPrompt(card, variant);
      const imageUrl = await callStreamWeaverImage(prompt, body);
      const image = await fetchGeneratedImage(imageUrl);
      const asset = await persistGeneratedArt(card.id, variant, image.bytes, image.mimeType);
      results.push({ cardId: card.id, name: card.name, variant, success: true, asset, sourceUrl: imageUrl });
    } catch (error: any) {
      results.push({ cardId: card.id, name: card.name, variant, success: false, error: error?.message || String(error) });
    }
  }

  return NextResponse.json({
    success: results.some((result) => result.success),
    variant,
    count: results.length,
    results,
    note: variant === 'hover'
      ? 'SeaArt returns still images through the current StreamWeaver route; uploaded hover assets will still swap on hover, and true GIF/video generation can be added when a video provider route exists.'
      : undefined,
  });
}
