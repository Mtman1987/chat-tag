import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { requireAdminRequest } from '@/lib/auth';
import { quackverseCards } from '@/lib/quackverse-data';
import { getQuackverseVisualCanon } from '@/lib/quackverse-visual-canon';
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
      return 'General Quackverse military family: preserve the established cinematic fantasy/science-fiction waterfowl language without copying a specific existing character.';
  }
}

function visualCanonForCard(card: any) {
  const legacyFamily = familyForCard(card);
  return getQuackverseVisualCanon({
    ...card,
    family: legacyFamily,
  });
}

function buildPrompt(card: any, variant: QuackverseArtVariant, family: ArtFamily) {
  const motion = variant === 'hover'
    ? 'Dynamic action-keyframe composition with controlled motion trails and energetic lighting.'
    : 'Clean collectible-card illustration with a strong centered full-character hero composition.';

  if (card.type === 'Equipment') {
    return [
      'QUACKVERSE EQUIPMENT ART.',
      `Create original artwork for the card "${card.name}".`,
      `Role/theme: ${card.role || card.effect || 'Quackverse equipment'}.`,
      familyDirection(family),
      motion,
      'Subject must be one premium fantasy/science-fiction equipment item, clearly readable as the primary object.',
      'Detailed materials, cinematic lighting, dramatic atmosphere and premium collectible-card rendering.',
      'ARTWORK ONLY. No card frame, no stats, no captions, no written text, no logo, no watermark and no UI.',
    ].filter(Boolean).join(' ');
  }

  const canon = visualCanonForCard(card);
  return [
    'QUACKVERSE CANON CHARACTER ART.',
    `Create original artwork for the existing Quackverse character "${card.name}".`,
    'CANONICAL IDENTITY IS FIXED. Do not redesign the species, plumage pattern, body silhouette, armor language, signature weapon or palette hierarchy.',
    `Species: ${canon.species}. Required plumage/anatomy: ${canon.plumage}.`,
    'The subject is an anthropomorphic upright waterfowl person with unmistakable species-correct bill, expressive avian eyes, visible feather detail, two arms and two legs. Never make a human in a bird mask and never make a normal four-legged or realistic bird.',
    `Class: ${canon.className}. Subclass/role: ${canon.subclass}. Body silhouette: ${canon.build}.`,
    `Visual affinity: ${canon.affinity}. Armor canon: ${canon.armorStyle}.`,
    `Signature weapon or focus: ${canon.signatureWeapon}. Keep it clearly readable and do not replace it with a random weapon.`,
    `Palette hierarchy: ${canon.palette.join(', ')}. Effects: ${canon.vfx}.`,
    familyDirection(family),
    card.effect ? `Ability/theme inspiration: ${card.effect}.` : '',
    card.flavor ? `Character attitude cue: ${card.flavor}.` : '',
    motion,
    canon.artStyle,
    'Use a distinct face, pose and silhouette appropriate to this specific character. Preserve realistic feather/material detail and cinematic depth while keeping the character dominant in frame.',
    'ARTWORK ONLY. No card frame, no stats, no captions, no written text, no logo, no watermark and no UI.',
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
  const canon = card.type === 'Duck' ? visualCanonForCard(card) : null;

  const sameAffinity = canon
    ? quackverseCards
        .filter((candidate) => candidate.id !== card.id && candidate.type === 'Duck')
        .filter((candidate) => visualCanonForCard(candidate).affinity === canon.affinity)
        .map((candidate) => absoluteArtUrl(candidate.artUrl, origin))
        .filter((value): value is string => Boolean(value))
    : [];

  const sameFamily = quackverseCards
    .filter((candidate) => candidate.id !== card.id && family !== 'general' && familyForCard(candidate) === family)
    .map((candidate) => absoluteArtUrl(candidate.artUrl, origin))
    .filter((value): value is string => Boolean(value));

  const broadReferences = quackverseCards
    .filter((candidate) => candidate.id !== card.id)
    .map((candidate) => absoluteArtUrl(candidate.artUrl, origin))
    .filter((value): value is string => Boolean(value));

  return [...new Set([...sameAffinity, ...sameFamily, ...broadReferences])].slice(0, 3);
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
      const canon = card.type === 'Duck' ? visualCanonForCard(card) : null;
      const generated = await callStreamWeaverImage(prompt, body, references);
      const image = await fetchGeneratedImage(generated.imageUrl);
      const asset = await persistGeneratedArt(card.id, variant, image.bytes, image.mimeType, generated.provider);
      results.push({
        cardId: card.id,
        name: card.name,
        variant,
        family,
        canon: canon
          ? {
              species: canon.species,
              affinity: canon.affinity,
              className: canon.className,
              subclass: canon.subclass,
              signatureWeapon: canon.signatureWeapon,
              palette: canon.palette,
            }
          : null,
        prompt: body?.includePrompt === true ? prompt : undefined,
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
      : 'Static Quackverse art is generated one image per card through StreamWeaver using the permanent visual canon plus matching-affinity finished art references.',
  });
}
