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
const STREAMWEAVER_TENANT_ID = String(process.env.QUACKVERSE_STREAMWEAVER_TENANT_ID || process.env.STREAMWEAVER_TENANT_ID || 'spacemountainlive').trim();
const IMAGE_PROMPT_MAX_CHARS = 2200;

const FINISHED_CARD_ART_RULES = [
  'FINAL CARD ART ONLY: one polished collectible-card illustration, not a concept sheet, not a model sheet and not a reference sheet.',
  'Exactly one primary subject in one camera angle and one pose. No duplicate character, no multiple angles, no turnaround, no front/back/side views, no panels, no vignettes, no anatomy/wing/weapon studies, no diagram callouts and no white sketch-sheet background.',
  'Card-crop safe: keep the face, bill, chest, silhouette, signature weapon/focus and key VFX readable inside the central 70% of the image, with no accidental cropped-off head, bill, arms, wings, legs, weapon or equipment.',
  'Use a cinematic environmental background with depth and lighting like finished production card art.',
].join(' ');

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
    case 'light-ranger': return 'Light Ranger family: noble radiant space-knight design, bright white/silver/gold armor, luminous feather motifs and heroic celestial energy.';
    case 'cosmic': return 'Cosmic family: deep-space armor with midnight blue, violet and cyan accents, starfield/nebula energy and polished futuristic knight shapes.';
    case 'void': return 'Void family: mysterious black, charcoal, violet and indigo armor, controlled dimensional energy and elegant ominous fantasy-sci-fi details.';
    case 'storm': return 'Storm family: steel, electric blue and storm-gray armor with visible lightning energy, wind and powerful dynamic silhouettes.';
    case 'galaxy-ranger': return 'Galaxy Ranger family: agile interstellar ranger armor with blue, purple and cyan stellar highlights, explorer energy and streamlined shapes.';
    case 'photon-ranger': return 'Photon Ranger family: sleek white, pale gold and electric cyan speed armor with feather-shaped light energy and bright photon trails.';
    default: return 'General Quackverse military family: preserve the established cinematic fantasy/science-fiction waterfowl language without copying a specific existing character.';
  }
}

function visualCanonForCard(card: any) {
  return getQuackverseVisualCanon({ ...card, family: card.family || familyForCard(card) });
}

function clampImagePrompt(prompt: string) {
  if (prompt.length <= IMAGE_PROMPT_MAX_CHARS) return prompt;
  const clipped = prompt.slice(0, IMAGE_PROMPT_MAX_CHARS - 1);
  const sentenceBoundary = clipped.lastIndexOf('. ');
  const safeEnd = sentenceBoundary >= 1500 ? sentenceBoundary + 1 : clipped.length;
  return clipped.slice(0, safeEnd).trim();
}

function canonCommonThreadDirection(card: any, canon: ReturnType<typeof visualCanonForCard>, family: ArtFamily) {
  const gameplayFamily = String(card.family || canon.family || family);
  const trunk = String(card.trunk || card.role || canon.subclass);
  return [
    `Common-thread lock: this card belongs to the ${gameplayFamily} family/trunk; it must look related through ${canon.armorStyle}, ${canon.palette.join(', ')}, ${canon.vfx}, ${canon.species} anatomy and ${canon.plumage} plumage.`,
    `Trunk likeness: ${trunk} controls the stance, gear, combat role and silhouette; keep those canonical while making this card unique through face, pose, expression and signature equipment.`,
  ].join(' ');
}

function equipmentCommonThreadDirection(card: any, family: ArtFamily) {
  const gameplayFamily = String(card.family || family);
  const trunk = String(card.trunk || card.role || card.type || 'equipment');
  return `Common-thread lock: this equipment belongs to the ${gameplayFamily} family/trunk, with ${trunk} materials, emblems, silhouette language and VFX that visually connect it to related cards while keeping this item unique.`;
}

function buildPrompt(card: any, variant: QuackverseArtVariant, family: ArtFamily) {
  const motion = variant === 'hover'
    ? 'Dynamic action-keyframe composition with controlled motion trails and energetic lighting.'
    : 'Clean collectible-card illustration with a strong centered full-character hero composition.';

  if (card.type === 'Equipment') {
    return [
      'QUACKVERSE EQUIPMENT ART.',
      `Create original artwork for the card "${card.name}".`,
      FINISHED_CARD_ART_RULES,
      equipmentCommonThreadDirection(card, family),
      `Gameplay family: ${card.family || 'Gear'}. Trunk/role: ${card.trunk || card.role || 'Gear'}.`,
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
    FINISHED_CARD_ART_RULES,
    canonCommonThreadDirection(card, canon, family),
    `Gameplay family: ${card.family || canon.family}. Trunk/role: ${card.trunk || card.role || canon.subclass}.`,
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

async function assetExists(asset?: QuackverseArtAsset | null) {
  if (!asset?.fileName) return false;
  try {
    const stat = await fs.stat(path.join(ART_ROOT, asset.fileName));
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function absoluteArtUrl(value: unknown, origin: string): string | null {
  const raw = String(value || '').trim();
  if (!raw || /\.gif(?:$|\?)/i.test(raw) || /\/api\/quackverse\/art\/canon(?:\?|$)/i.test(raw)) return null;
  try { return new URL(raw, origin).toString(); }
  catch { return null; }
}

async function referenceImagesFor(card: any, origin: string, manifest: ReturnType<typeof normalizeQuackverseArtManifest>): Promise<string[]> {
  const family = familyForCard(card);
  const canon = card.type === 'Duck' ? visualCanonForCard(card) : null;
  const candidates = quackverseCards.filter((candidate) => candidate.id !== card.id);
  const ordered = [
    ...(canon ? candidates.filter((candidate) => candidate.type === 'Duck' && visualCanonForCard(candidate).affinity === canon.affinity) : []),
    ...candidates.filter((candidate) => family !== 'general' && familyForCard(candidate) === family),
    ...candidates,
  ];
  const urls: string[] = [];
  for (const candidate of ordered) {
    const asset = manifest[String(candidate.id)]?.static;
    if (asset && await assetExists(asset)) {
      const url = new URL(quackverseArtFileUrl(candidate.id, 'static', asset.updatedAt), origin).toString();
      if (!urls.includes(url)) urls.push(url);
    }
    if (urls.length >= 3) break;
  }
  return urls;
}

function normalizeStreamWeaverPayload(data: any) {
  return data?.data && typeof data.data === 'object' ? data.data : data;
}

async function callStreamWeaverImage(prompt: string, body: any, referenceImages: string[]) {
  const tenantId = String(body.tenantId || body.streamweaverTenantId || STREAMWEAVER_TENANT_ID).trim();
  if (!tenantId) throw new Error('Quackverse StreamWeaver tenant is not configured.');
  const requestBody: Record<string, unknown> = {
    prompt,
    scope: 'public',
    tenantId,
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
    headers: { 'Content-Type': 'application/json', 'x-mountainview-bridge': '1' },
    body: JSON.stringify(requestBody),
  });
  const raw = await response.json().catch(() => null);
  const data = normalizeStreamWeaverPayload(raw);
  if (!response.ok || raw?.ok === false) {
    throw new Error(raw?.error || data?.error || raw?.message || data?.message || `StreamWeaver image generation failed (${response.status})`);
  }
  const imageUrl = [
    ...(Array.isArray(data?.persistedImageUrls) ? data.persistedImageUrls : []),
    ...(Array.isArray(data?.images) ? data.images : []),
    data?.persistedImageUrl,
    data?.image,
    data?.imageResourceUrl,
  ].map((value) => String(value || '').trim()).find(Boolean);
  if (!imageUrl) throw new Error('StreamWeaver did not return an image URL.');
  const absoluteImageUrl = new URL(imageUrl, STREAMWEAVER_URL).toString();
  return { imageUrl: absoluteImageUrl, provider: String(data?.provider || 'streamweaver'), tenantId };
}

async function fetchGeneratedImage(imageUrl: string) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Could not download generated image (${response.status}) from ${imageUrl}`);
  const mimeType = String(response.headers.get('content-type') || 'image/png').split(';')[0].toLowerCase();
  if (!mimeType.startsWith('image/')) throw new Error(`Generated asset was not an image (${mimeType}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error('Generated image was empty.');
  return { bytes, mimeType };
}

async function persistGeneratedArt(cardId: number, variant: QuackverseArtVariant, bytes: Buffer, mimeType: string, provider: string) {
  await fs.mkdir(path.join(ART_ROOT, String(cardId)), { recursive: true });
  const fileName = `${variant}.${mimeToExt(mimeType)}`;
  const relativePath = `${cardId}/${fileName}`;
  const existingState = await readAppState();
  const previous = normalizeQuackverseArtManifest(existingState?.gameSettings?.default?.quackverseArt)[String(cardId)]?.[variant];
  await fs.writeFile(path.join(ART_ROOT, relativePath), bytes);
  if (previous?.fileName && previous.fileName !== relativePath) {
    await fs.rm(path.join(ART_ROOT, previous.fileName), { force: true }).catch(() => {});
  }
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
    state.gameSettings.default.quackverseArt = { ...current, [String(cardId)]: entry };
    return state.gameSettings.default.quackverseArt;
  });
  return { ...asset, url: quackverseArtFileUrl(cardId, variant, asset.updatedAt) };
}

export async function POST(req: NextRequest) {
  const auth = requireAdminRequest(req);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  const variant = String(body?.variant || 'static') as QuackverseArtVariant;
  if (variant !== 'static' && variant !== 'hover') return NextResponse.json({ error: 'variant must be static or hover.' }, { status: 400 });

  const limit = Math.max(1, Math.min(20, Number(body?.limit || 5) || 5));
  const missingOnly = body?.missingOnly !== false;
  const requestedIds = Array.isArray(body?.cardIds)
    ? body.cardIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id))
    : [];
  const state = await readAppState();
  const manifest = normalizeQuackverseArtManifest(state?.gameSettings?.default?.quackverseArt);
  const candidates = [] as typeof quackverseCards;
  for (const card of quackverseCards) {
    if (requestedIds.length && !requestedIds.includes(card.id)) continue;
    if (missingOnly && await assetExists(manifest[String(card.id)]?.[variant])) continue;
    candidates.push(card);
    if (candidates.length >= limit) break;
  }

  const results: any[] = [];
  for (const card of candidates) {
    try {
      const family = familyForCard(card);
      const references = await referenceImagesFor(card, req.nextUrl.origin, manifest);
      const prompt = clampImagePrompt(buildPrompt(card, variant, family));
      const canon = card.type === 'Duck' ? visualCanonForCard(card) : null;
      const generated = await callStreamWeaverImage(prompt, body, references);
      const image = await fetchGeneratedImage(generated.imageUrl);
      const asset = await persistGeneratedArt(card.id, variant, image.bytes, image.mimeType, generated.provider);
      manifest[String(card.id)] = { ...(manifest[String(card.id)] || {}), [variant]: asset } as any;
      results.push({
        cardId: card.id,
        name: card.name,
        variant,
        family,
        trunk: card.trunk,
        canon: canon ? {
          species: canon.species,
          affinity: canon.affinity,
          className: canon.className,
          subclass: canon.subclass,
          signatureWeapon: canon.signatureWeapon,
          palette: canon.palette,
        } : null,
        prompt: body?.includePrompt === true ? prompt : undefined,
        referenceCount: references.length,
        provider: generated.provider,
        tenantId: generated.tenantId,
        success: true,
        asset,
      });
    } catch (error: any) {
      results.push({ cardId: card.id, name: card.name, variant, success: false, error: error?.message || String(error) });
    }
  }

  let remaining = 0;
  for (const card of quackverseCards) {
    if (!(await assetExists(manifest[String(card.id)]?.[variant]))) remaining += 1;
  }
  return NextResponse.json({
    success: results.some((result) => result.success) || (candidates.length === 0 && remaining === 0),
    variant,
    count: results.length,
    results,
    remaining,
    complete: remaining === 0,
    nextRecommendedLimit: Math.min(5, remaining),
    note: 'AI artwork is generated once, persisted per card, and skipped on future missing-only runs after the physical file is verified.',
  });
}
