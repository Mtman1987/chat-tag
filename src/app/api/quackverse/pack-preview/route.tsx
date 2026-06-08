import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { quackverseCards } from '@/lib/quackverse-data';
import { normalizeQuackverseArtManifest } from '@/lib/quackverse-art';
import { dataDirPath, readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ART_ROOT = path.join(dataDirPath(), 'quackverse-card-art');
const PUBLIC_ROOT = path.join(process.cwd(), 'public');

const rarityColors: Record<string, { border: string; fill: string; text: string }> = {
  Common: { border: '#94a3b8', fill: '#172033', text: '#e2e8f0' },
  Uncommon: { border: '#22c55e', fill: '#10281c', text: '#dcfce7' },
  Rare: { border: '#38bdf8', fill: '#0b2637', text: '#e0f2fe' },
  Epic: { border: '#a855f7', fill: '#25133a', text: '#f3e8ff' },
  Legendary: { border: '#f59e0b', fill: '#38220a', text: '#fef3c7' },
  Unknown: { border: '#64748b', fill: '#111827', text: '#e5e7eb' },
};

function mimeTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.avif') return 'image/avif';
  return 'image/jpeg';
}

async function inlineCardArt(cardId: number, artUrl: string | undefined, manifest: ReturnType<typeof normalizeQuackverseArtManifest>) {
  const uploaded = manifest[String(cardId)]?.static;
  if (uploaded) {
    const buffer = await fs.readFile(path.join(ART_ROOT, uploaded.fileName)).catch(() => null);
    if (buffer) return `data:${uploaded.mimeType};base64,${buffer.toString('base64')}`;
  }

  if (artUrl && artUrl.startsWith('/')) {
    const safePath = path.normalize(artUrl).replace(/^(\.\.[\\/])+/, '');
    const filePath = path.join(PUBLIC_ROOT, safePath);
    if (filePath.startsWith(PUBLIC_ROOT)) {
      const buffer = await fs.readFile(filePath).catch(() => null);
      if (buffer) return `data:${mimeTypeFor(filePath)};base64,${buffer.toString('base64')}`;
    }
  }

  return '';
}

function wrapText(value: string, maxLength: number, maxLines: number) {
  const words = String(value || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

function statValue(card: any, stat: string) {
  return Number(card?.[stat.toLowerCase()] || 0);
}

function PackCard({ card }: { card: any }) {
  const rarity = rarityColors[card.rarity] || rarityColors.Unknown;
  const abilities = (card.abilities.length ? card.abilities : [card.effect]).filter(Boolean).slice(0, 2);
  const flavorLines = wrapText(card.flavor || card.role || card.effect || '', 33, 3);

  return (
    <div
      style={{
        width: 330,
        height: 880,
        display: 'flex',
        flexDirection: 'column',
        border: `8px solid ${rarity.border}`,
        borderRadius: 28,
        background: '#0f172a',
        padding: 18,
        color: '#f8fafc',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#94a3b8' }}>#{card.id} {card.type}</div>
        <div
          style={{
            border: `2px solid ${rarity.border}`,
            borderRadius: 8,
            background: rarity.fill,
            color: rarity.text,
            fontSize: 13,
            fontWeight: 900,
            padding: '5px 9px',
          }}
        >
          {card.rarity}
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', fontSize: 25, fontWeight: 900, lineHeight: 1.08 }}>
        {wrapText(card.name, 20, 3).map((line) => <div key={line}>{line}</div>)}
      </div>
      <div style={{ marginTop: 10, fontSize: 17, fontWeight: 700, color: '#bae6fd' }}>{card.role || card.type}</div>

      <div
        style={{
          marginTop: 16,
          width: '100%',
          height: 250,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.12)',
          background: rarity.fill,
        }}
      >
        {card.art ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundImage: `url(${card.art})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        ) : (
          <div style={{ fontSize: 52, fontWeight: 900, color: rarity.border }}>QV</div>
        )}
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 6 }}>
        {['ATK', 'DEF', 'SPD', 'SPC', 'HP'].map((stat) => (
          <div
            key={stat}
            style={{
              width: 52,
              height: 64,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.055)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, color: '#94a3b8' }}>{stat}</div>
            <div style={{ marginTop: 5, fontSize: 25, fontWeight: 900 }}>{statValue(card, stat)}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {abilities.map((ability: string, index: number) => (
          <div
            key={`${card.id}-${index}`}
            style={{
              height: 92,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              borderRadius: 12,
              background: 'rgba(0,0,0,0.25)',
              padding: '10px 14px',
              color: '#dbeafe',
              fontSize: 17,
              fontWeight: 700,
              lineHeight: 1.22,
            }}
          >
            {wrapText(ability, 36, 3).map((line) => <div key={line}>{line}</div>)}
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 'auto',
          height: 104,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.09)',
          background: 'rgba(255,255,255,0.045)',
          padding: '10px 14px',
          color: '#cbd5e1',
          fontSize: 17,
          fontStyle: 'italic',
          lineHeight: 1.25,
        }}
      >
        {flavorLines.map((line) => <div key={line}>{line}</div>)}
      </div>
    </div>
  );
}

export async function GET(req: NextRequest) {
  const ids = String(req.nextUrl.searchParams.get('ids') || '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((id) => Number.isFinite(id) && id > 0)
    .slice(0, 5);

  if (ids.length === 0) {
    return new Response('ids required', { status: 400 });
  }

  const state = await readAppState();
  const manifest = normalizeQuackverseArtManifest(state?.gameSettings?.default?.quackverseArt);
  const cards = await Promise.all(
    ids.map(async (id) => {
      const card = quackverseCards.find((item) => item.id === id) as any;
      const fullCard = card || {};
      return {
        id,
        ...fullCard,
        name: fullCard.name || `Card ${id}`,
        type: fullCard.type || 'Card',
        role: fullCard.role || '',
        rarity: fullCard.rarity || 'Unknown',
        abilities: Array.isArray(fullCard.abilities) ? fullCard.abilities : [],
        effect: fullCard.effect || '',
        flavor: fullCard.flavor || '',
        art: await inlineCardArt(id, fullCard.artUrl || '', manifest),
      };
    })
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: '1800px',
          height: '1040px',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #07111f 0%, #172033 52%, #08131f 100%)',
          color: '#f8fafc',
          fontFamily: 'Arial, sans-serif',
          padding: 34,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 48 }}>
          <div style={{ fontSize: 34, fontWeight: 900 }}>Quackverse Pack</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#93c5fd' }}>SPMT Chat Tag</div>
        </div>
        <div style={{ marginTop: 20, display: 'flex', gap: 22 }}>
          {cards.map((card) => <PackCard key={card.id} card={card} />)}
        </div>
      </div>
    ),
    {
      width: 1800,
      height: 1040,
      headers: {
        'Cache-Control': 'public, max-age=300',
      },
    }
  );
}
