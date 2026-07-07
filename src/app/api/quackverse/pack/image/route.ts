import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { readAppState } from '@/lib/volume-store';
import { normalizeQuackverseArtManifest } from '@/lib/quackverse-art';
import { getPublicAppOrigin } from '@/lib/public-origin';
import { quackverseCards } from '@/lib/quackverse-data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WIDTH = 1600;
const HEIGHT = 900;
const CARD_WIDTH = 286;
const CARD_HEIGHT = 500;
const CARD_ART_HEIGHT = 318;
const CARD_GAP = 18;
const CARDS_TOTAL_WIDTH = CARD_WIDTH * 5 + CARD_GAP * 4;
const START_X = Math.max(40, Math.floor((WIDTH - CARDS_TOTAL_WIDTH) / 2));
const START_Y = 180;

const rarityColors: Record<string, string> = {
  Common: '#94a3b8',
  Uncommon: '#34d399',
  Rare: '#38bdf8',
  Epic: '#e879f9',
  Legendary: '#fbbf24',
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(value: string, max = 32) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function rarityColor(rarity?: string) {
  return rarityColors[rarity || ''] || '#22d3ee';
}

function buildCardArtUrl(cardId: number, origin: string, manifest: Record<string, any>) {
  const custom = manifest[String(cardId)]?.static?.url;
  const card = quackverseCards.find((item) => item.id === cardId);
  const rawUrl = custom || card?.artUrl || card?.artHoverUrl || '';
  if (!rawUrl) return '';
  try {
    return new URL(rawUrl, origin).toString();
  } catch {
    return rawUrl;
  }
}

async function fetchImageBuffer(url: string) {
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

function buildBackgroundSvg(packTitle: string, packSubtitle: string) {
  return Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#07111f"/>
          <stop offset="55%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#111827"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="18%" r="65%">
          <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.22"/>
          <stop offset="50%" stop-color="#a78bfa" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
      <text x="72" y="92" fill="#f8fafc" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700">
        ${escapeXml(packTitle)}
      </text>
      <text x="72" y="132" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="22">
        ${escapeXml(packSubtitle)}
      </text>
      <text x="${WIDTH - 72}" y="92" text-anchor="end" fill="#94a3b8" font-family="Arial, Helvetica, sans-serif" font-size="18">
        Quackverse
      </text>
      <text x="${WIDTH - 72}" y="132" text-anchor="end" fill="#94a3b8" font-family="Arial, Helvetica, sans-serif" font-size="18">
        Card Pack Preview
      </text>
    </svg>
  `);
}

function buildCardFrameSvg(card: any, index: number, rarity: string) {
  const x = START_X + index * (CARD_WIDTH + CARD_GAP);
  const y = START_Y;
  const cardName = truncate(card.name || `Card ${card.id}`);
  const cardType = `${card.rarity || rarity || 'Unknown'} · ${card.type || 'Card'}`;
  const accent = rarityColor(card.rarity || rarity);

  return Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${x}" y="${y}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="24" fill="rgba(2,6,23,0.82)" stroke="${accent}" stroke-opacity="0.55" stroke-width="2"/>
      <rect x="${x + 14}" y="${y + 14}" width="${CARD_WIDTH - 28}" height="${CARD_ART_HEIGHT}" rx="18" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" />
      <rect x="${x + 14}" y="${y + CARD_ART_HEIGHT + 28}" width="${CARD_WIDTH - 28}" height="110" rx="18" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" />
      <rect x="${x + 20}" y="${y + CARD_HEIGHT - 46}" width="${CARD_WIDTH - 40}" height="26" rx="13" fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-opacity="0.3"/>
      <text x="${x + 26}" y="${y + CARD_ART_HEIGHT + 64}" fill="#f8fafc" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700">
        ${escapeXml(cardName)}
      </text>
      <text x="${x + 26}" y="${y + CARD_ART_HEIGHT + 93}" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="15">
        ${escapeXml(cardType)}
      </text>
      <text x="${x + 26}" y="${y + CARD_HEIGHT - 27}" fill="${accent}" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700">
        #${card.id}
      </text>
      <text x="${x + CARD_WIDTH - 26}" y="${y + CARD_HEIGHT - 27}" text-anchor="end" fill="#e2e8f0" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700">
        ${escapeXml(card.rarity || 'Unknown')}
      </text>
    </svg>
  `);
}

function buildFallbackCardArtSvg(card: any, index: number, rarity: string) {
  const x = START_X + index * (CARD_WIDTH + CARD_GAP) + 14;
  const y = START_Y + 14;
  const accent = rarityColor(card.rarity || rarity);
  const name = truncate(card.name || `Card ${card.id}`, 24);
  const type = truncate(card.type || 'Quackverse', 22);

  return Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cardBg${index}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#020617"/>
          <stop offset="45%" stop-color="#172554"/>
          <stop offset="100%" stop-color="#312e81"/>
        </linearGradient>
        <radialGradient id="cardGlow${index}" cx="50%" cy="38%" r="58%">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.42"/>
          <stop offset="55%" stop-color="${accent}" stop-opacity="0.12"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect x="${x}" y="${y}" width="${CARD_WIDTH - 28}" height="${CARD_ART_HEIGHT}" rx="18" fill="url(#cardBg${index})"/>
      <rect x="${x}" y="${y}" width="${CARD_WIDTH - 28}" height="${CARD_ART_HEIGHT}" rx="18" fill="url(#cardGlow${index})"/>
      <circle cx="${x + (CARD_WIDTH - 28) / 2}" cy="${y + 112}" r="58" fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-opacity="0.55" stroke-width="4"/>
      <text x="${x + (CARD_WIDTH - 28) / 2}" y="${y + 103}" text-anchor="middle" fill="#f8fafc" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="800">
        DUCK
      </text>
      <text x="${x + (CARD_WIDTH - 28) / 2}" y="${y + 142}" text-anchor="middle" fill="#c4b5fd" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700">
        #${escapeXml(String(card.id || '?'))}
      </text>
      <text x="${x + (CARD_WIDTH - 28) / 2}" y="${y + 238}" text-anchor="middle" fill="#f8fafc" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="700">
        ${escapeXml(name)}
      </text>
      <text x="${x + (CARD_WIDTH - 28) / 2}" y="${y + 270}" text-anchor="middle" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="16">
        ${escapeXml(type)}
      </text>
    </svg>
  `);
}

export async function GET(req: NextRequest) {
  const packId = String(req.nextUrl.searchParams.get('packId') || '').trim();
  if (!packId) {
    return NextResponse.json({ error: 'packId is required.' }, { status: 400 });
  }

  const state = await readAppState();
  const event = Array.isArray(state.quackversePackOpens)
    ? state.quackversePackOpens.find((entry: any) => String(entry?.id || '') === packId)
    : null;

  if (!event) {
    return NextResponse.json({ error: 'Pack not found.' }, { status: 404 });
  }

  const cards = Array.isArray(event.cards) ? event.cards.slice(0, 5) : [];
  const origin = getPublicAppOrigin(req);
  const manifest = normalizeQuackverseArtManifest(state?.gameSettings?.default?.quackverseArt);

  const cardImages = await Promise.all(
    cards.map(async (card: any, index: number) => {
      const cardId = Number(card?.id);
      if (!Number.isFinite(cardId)) return null;

      const artUrl = buildCardArtUrl(cardId, origin, manifest);
      const buffer = await fetchImageBuffer(artUrl);
      if (!buffer) {
        return {
          input: buildFallbackCardArtSvg(card, index, card.rarity),
          left: 0,
          top: 0,
        };
      }

      const x = START_X + index * (CARD_WIDTH + CARD_GAP) + 14;
      const y = START_Y + 14;
      const resized = await sharp(buffer)
        .resize(CARD_WIDTH - 28, CARD_ART_HEIGHT, { fit: 'cover', position: 'centre' })
        .flatten({ background: '#0f172a' })
        .png()
        .toBuffer();

      return { input: resized, left: x, top: y };
    }),
  );

  const subtitle = [
    event.twitchUsername ? `@${event.twitchUsername}` : 'A player',
    'opened a pack',
    `${Number(event.packsRemaining || 0)}/3 packs left today`,
  ].filter(Boolean).join(' · ');

  const composed = await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: '#0f172a',
    },
  })
    .composite([
      { input: buildBackgroundSvg('Quackverse Pack Opened', subtitle), top: 0, left: 0 },
      ...cardImages.filter(Boolean) as Array<{ input: Buffer; left: number; top: number }>,
      ...cards.map((card: any, index: number) => ({
        input: buildCardFrameSvg(card, index, card.rarity),
        top: 0,
        left: 0,
      })),
    ])
    .png()
    .toBuffer();

  return new NextResponse(composed as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300, must-revalidate',
    },
  });
}
