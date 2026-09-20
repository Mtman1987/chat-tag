import sharp from 'sharp';
import { MOSAIC_COLORS, MOSAIC_HEIGHT, MOSAIC_WIDTH, type MosaicColorCode } from '@/lib/nebula-mosaic';
import { getStreamweaverSecret } from '@/lib/runtime-secrets';

const STREAMWEAVER_URL = String(
  process.env.STREAMWEAVER_URL || process.env.STREAMWEAVE_URL || 'https://streamweaver-new.fly.dev',
).replace(/\/$/, '');
const STREAMWEAVER_TENANT_ID = String(
  process.env.MOSAIC_STREAMWEAVER_TENANT_ID || process.env.STREAMWEAVER_TENANT_ID || 'spacemountainlive',
).trim();
const MOSAIC_PROVIDER = String(process.env.MOSAIC_IMAGE_PROVIDER || 'seaart').trim().toLowerCase();

function promptForTheme(theme: string) {
  return [
    `Create one recognizable ${theme} as a finished collaborative pixel-art mosaic.`,
    'Portrait 4:5 composition with one centered subject, a complete readable silhouette, and generous dark background around the edges.',
    'Use only ten flat colors: red, blue, green, yellow, purple, orange, pink, white, black, and cyan.',
    'Large connected color regions, crisp hard edges, no gradients, no antialiasing, and no tiny isolated details.',
    'The artwork will be reduced to exactly 40 columns by 50 rows and split into four equal 20-by-25 work boards.',
    'ARTWORK ONLY. No grid lines, letters, numbers, captions, labels, frame, interface, logo, or watermark.',
  ].join(' ');
}

function normalizeStreamWeaverPayload(data: any) {
  return data?.data && typeof data.data === 'object' ? data.data : data;
}

async function requestImage(theme: string) {
  if (!STREAMWEAVER_TENANT_ID) throw new Error('Nebula Mosaic image generation is not configured.');
  const serviceSecret = getStreamweaverSecret();
  const response = await fetch(`${STREAMWEAVER_URL}/api/ai/image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mountainview-bridge': '1',
      Authorization: `Bearer ${serviceSecret}`,
      'x-bot-secret': serviceSecret,
    },
    body: JSON.stringify({
      prompt: promptForTheme(theme),
      scope: 'public',
      tenantId: STREAMWEAVER_TENANT_ID,
      // SeaArt's production CLI rejects 1024x1536. Generate at its supported
      // square size, then let Sharp crop the centered art to the 40x50 board.
      resolution: '1024x1024',
      numImages: 1,
      providerOverride: MOSAIC_PROVIDER,
      providerParams: {
        negativePrompt: 'text, letters, numbers, words, UI, controls, grid labels, multiple subjects, collage, photo, gradients, blur, watermark, logo',
      },
    }),
  });
  const raw = await response.json().catch(() => null);
  const data = normalizeStreamWeaverPayload(raw);
  if (!response.ok || raw?.ok === false) {
    throw new Error(raw?.error || data?.error || raw?.message || data?.message || `Mosaic image generation failed (${response.status}).`);
  }
  const imageUrl = [
    ...(Array.isArray(data?.persistedImageUrls) ? data.persistedImageUrls : []),
    ...(Array.isArray(data?.images) ? data.images : []),
    data?.persistedImageUrl,
    data?.image,
    data?.imageResourceUrl,
  ].map((value) => String(value || '').trim()).find(Boolean);
  if (!imageUrl) throw new Error('Image generation returned no artwork.');
  return {
    imageUrl: new URL(imageUrl, STREAMWEAVER_URL).toString(),
    provider: String(data?.provider || MOSAIC_PROVIDER || 'streamweaver'),
  };
}

function hexRgb(hex: string) {
  const value = hex.replace('#', '');
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)] as const;
}

const RGB_PALETTE = Object.entries(MOSAIC_COLORS).map(([code, value]) => ({
  code: code as MosaicColorCode,
  rgb: hexRgb(value.hex),
}));

function nearestColor(red: number, green: number, blue: number): MosaicColorCode {
  let closest = RGB_PALETTE[0];
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of RGB_PALETTE) {
    const [r, g, b] = candidate.rgb;
    const distance = (red - r) ** 2 + (green - g) ** 2 + (blue - b) ** 2;
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest.code;
}

async function imageToTarget(bytes: Buffer) {
  const { data, info } = await sharp(bytes)
    .flatten({ background: '#111827' })
    .resize(MOSAIC_WIDTH, MOSAIC_HEIGHT, { fit: 'cover', position: 'centre', kernel: sharp.kernel.lanczos3 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== MOSAIC_WIDTH || info.height !== MOSAIC_HEIGHT || info.channels < 3) {
    throw new Error('Generated artwork could not be converted to a 40-by-50 Mosaic.');
  }
  const target: MosaicColorCode[] = [];
  for (let index = 0; index < data.length; index += info.channels) {
    target.push(nearestColor(data[index], data[index + 1], data[index + 2]));
  }
  return target;
}

export async function generateMosaicTemplate(theme: string) {
  const generated = await requestImage(theme);
  const response = await fetch(generated.imageUrl);
  if (!response.ok) throw new Error(`Generated Mosaic could not be downloaded (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error('Generated Mosaic image was empty or too large.');
  return {
    target: await imageToTarget(bytes),
    provider: generated.provider,
    sourceImageUrl: generated.imageUrl,
  };
}
