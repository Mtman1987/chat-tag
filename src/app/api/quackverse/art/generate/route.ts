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

type ArtFamily = 'light-ranger' | 'cosmic' | 'void' | 'storm' | 'galaxy-ranger' | 'photon-ranger' | 'general';

function mimeToExt(mimeType: string) {
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  return 'png';
}

function familyForCard(card: any): ArtFamily {
  const source = [card.name, card.role, card.effect, card.flavor, card.artUrl]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
  if (/photon/.test(source)) return 'photon-ranger';
  if (/galaxy/.test(source)) return 'galaxy-ranger';
  if (/void|dark armor|dark-armor/.test(source)) return 'void';
  if (/storm|lightning|thunder/.test(source)) return 'storm';
  if (/light ranger|light-ranger|radiant/.test(source)) return 'light-ranger';
  if (/cosmic|nebula|stellar/.test(source)) return 'cosmic';
  return 'general';
}

function familyDirection(family: ArtFamily) {
  switch (family) {
    case 'light-ranger':
      return 'Light Ranger family: noble radiant space-knight design, bright white/silver/gold armor, luminous feather motifs and heroic celestial energy.';
    case 'cosmic':
      return 'Cosmic family: deep-space armor with midnight blue, violet and cyan accents, starfield/nebula energy and polished futuristic knight shapes.';
    case 'void':
      return 'Void family: mysterious black, charcoal, violet and indigo armor, controlled dimensional energy and elegant ominous fantasy-sci-fi details.';
    case 'storm':
      return 'Storm family: steel, electric blue and storm-gray armor with visible lightning energy, wind and powerful dynamic silhouettes.';
    case 'galaxy-ranger':
      return 'Galaxy Ranger family: agile interstellar ranger armor with blue, purple and cyan stellar highlights, explorer energy and streamlined shapes.';
    case 'photon-ranger':
      return 'Photon Ranger family: sleek white, pale gold and electric cyan speed armor with feather-shaped light energy and bright photon trails.';
    default:
      return 'Match the established Quackverse visual language shown by the supplied finished-card references without copying a specific existing character.';
  }
}

function buildPrompt(card: any, variant: QuackverseArtVariant, family: ArtFamily) {
  const motion = variant === 'hover'
    ? 'dynamic action-keyframe composition with motion trails and energetic lighting'
    : 'clean collectible-card illustration with a strong centered hero composition';
  return [
    'QUACKVERSE CHARACTER ART.',
    `Create original artwork for the card "${card.name}".`,
    card.type === 'Equipment'
      ? 'Subject: a premium fantasy/sci-fi equipment item from the Quackverse, clearly readable as one primary object.'
      : 'Subject: an anthropomorphic humanoid duck hero: unmistakable duck bill, expressive duck eyes, visible feather details, upright humanoid proportions, two arms and two legs. Do not make a human wearing a duck mask and do not make a normal realistic duck.',
    `Card type: ${card.type}. Role/theme: ${card.role || 'Quackverse adventurer'}. Rarity: ${card.rarity || 'Unknown'}.`,
    card.effect ? `Ability/theme inspiration: ${card.effect}.` : '',
    card.flavor ? `Character flavor: ${card.flavor}.` : '',
    familyDirection(family),
    motion + '.',
    'Premium polished fantasy/science-fiction trading-card illustration, strong readable silhouette, detailed materials, cinematic lighting, dramatic atmosphere, character/object dominant in frame.',
    'ARTWORK ONLY. No card frame, no stats, no captions, no written text, no logo, no watermark, no UI.',
  ].filter(Boolean).join(' ');
}

function absoluteArtUrl(value: unknown, origin: string): string | null {
  const raw = String(value || '').trim();
  if (!raw || /\.gif(?:$|\?)/i.test(raw)) return null;
  try {
    return new URL(raw, origin).toString();
  } catch {
    return null;
  }
}

function referenceImagesFor(card: any, origin: string): string[] {
  const family = familyForCard(card);
  const sameFamily = quackverseCards
    .filter((candidate) => candidate.id !== card.id && family !== 'general' && familyForCard(candidate) === family)
    .map((candidate) => absoluteArtUrl(candidate.artUrl, origin))
    .filter((value): value is string => Boolean(value));

  if (sameFamily.length >= 3) return [...new Set(sameFamily)].slice(0, 3);

  const broadReferences = quackverseCards
    .filter((candidate) => candidate.id !== card.id)
    .map((candidate) => absoluteArtUrl(candidate.artUrl, origin))
    .filter((value): value is string => Boolean(value));

  return [...new Set([...sameFamily, ...broadReferences])].slice(0, 3);
}

async function callStreamWeaverImage(prompt: string, body: any, referenceImages: string[]) {
  const requestBody: Record<string, unknown> = {
    prompt,
    scope: 'public',
    tenantId: body.tenantId || body.streamweaverTenantId || undefined,
    resolution: body.resolution || '1024x1024',
    numImages: 1,
    model: body.model || undefined,
    providerParams: {
      referenceImages,
      seed: Number(body.seed || 0) || undefined,
    },
  };
  if (body.providerOverride) requestBody.providerOverride = body.providerOverride;

  const response = await fetch(`${STREAMWEAVER_URL}/api/ai/image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mountainview-bridge': '1',
    },
    body: JSON.stringify(requestBody),
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
  return { imageUrl, provider: String(data?.provider || 'streamweaver') };
}

async function fetchGeneratedImage(imageUrl: string) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Could not download generated image (${response.status})`);
  const mimeType = String(response.headers.get('content-type') || 'image/png').split(';')[0].toLowerCase();
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error('Generated image was empty.');
  return { bytes, mimeType };
}

async function persistGeneratedArt(cardId: number, variant: QuackverseArtVariant, bytes: Buffer, mimeType: string, provider: string) {
  await fs.mkdir(path.join(ART_ROOT, String(cardId)), { recursive: true });
  const fileName = `${variant}.${mimeToExt(mimeType)}`;
  const relativePath = `${cardId}/${fileName}`;
  await fs.writeFile(path.join(ART_ROOT, relativePath), bytes);
  const asset: QuackverseArtAsset = {
    fileName: relativePath,
    mimeType,
    originalName: `streamweaver-${provider}-${cardId}-${variant}.${mimeToExt(mimeType)}`,
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
      const family = familyForCard(card);
      const references = referenceImagesFor(card, req.nextUrl.origin);
      const prompt = buildPrompt(card, variant, family);
      const generated = await callStreamWeaverImage(prompt, body, references);
      const image = await fetchGeneratedImage(generated.imageUrl);
      const asset = await persistGeneratedArt(card.id, variant, image.bytes, image.mimeType, generated.provider);
      results.push({
        cardId: card.id,
        name: card.name,
        variant,
        family,
        referenceCount: references.length,
        provider: generated.provider,
        success: true,
        asset,
        sourceUrl: generated.imageUrl,
      });
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
      ? 'The current image route returns still images. True GIF/video hover generation remains a later animation step.'
      : 'Static Quackverse art is generated one image per card through StreamWeaver using finished Quackverse art as visual references when available.',
  });
}
