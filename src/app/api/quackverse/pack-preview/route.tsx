import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import { quackverseCards } from '@/lib/quackverse-data';
import { normalizeQuackverseArtManifest } from '@/lib/quackverse-art';
import { dataDirPath, readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ART_ROOT = path.join(dataDirPath(), 'quackverse-card-art');
const PUBLIC_ROOT = path.join(process.cwd(), 'public');
const VIEWPORT = { width: 1800, height: 1040, deviceScaleFactor: 1 };
const CHROMIUM_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];

const rarityColors: Record<string, { border: string; fill: string; text: string }> = {
  Common: { border: '#94a3b8', fill: '#172033', text: '#e2e8f0' },
  Uncommon: { border: '#22c55e', fill: '#10281c', text: '#dcfce7' },
  Rare: { border: '#38bdf8', fill: '#0b2637', text: '#e0f2fe' },
  Epic: { border: '#a855f7', fill: '#25133a', text: '#f3e8ff' },
  Legendary: { border: '#f59e0b', fill: '#38220a', text: '#fef3c7' },
  Unknown: { border: '#64748b', fill: '#111827', text: '#e5e7eb' },
};

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function mimeTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.avif') return 'image/avif';
  return 'image/jpeg';
}

async function inlineCardArt(
  cardId: number,
  artUrl: string | undefined,
  manifest: ReturnType<typeof normalizeQuackverseArtManifest>
) {
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

async function resolveChromiumExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROMIUM_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }

  return undefined;
}

function renderCard(card: any) {
  const rarity = rarityColors[card.rarity] || rarityColors.Unknown;
  const abilities = (card.abilities.length ? card.abilities : [card.effect]).filter(Boolean).slice(0, 2);
  const flavorLines = wrapText(card.flavor || card.role || card.effect || '', 33, 3);
  const artMarkup = card.art
    ? `<img src="${card.art}" alt="${escapeHtml(card.name)}" style="width:100%;height:100%;object-fit:cover;display:block;" />`
    : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:52px;font-weight:900;color:${rarity.border};">QV</div>`;

  return `
    <article style="
      width:330px;
      height:880px;
      display:flex;
      flex-direction:column;
      box-sizing:border-box;
      border:8px solid ${rarity.border};
      border-radius:28px;
      background:#0f172a;
      padding:18px;
      color:#f8fafc;
      overflow:hidden;
      box-shadow:0 32px 80px rgba(0,0,0,0.36);
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div style="font-size:15px;font-weight:800;color:#94a3b8;">#${card.id} ${escapeHtml(card.type)}</div>
        <div style="
          border:2px solid ${rarity.border};
          border-radius:8px;
          background:${rarity.fill};
          color:${rarity.text};
          font-size:13px;
          font-weight:900;
          padding:5px 9px;
          white-space:nowrap;
        ">${escapeHtml(card.rarity)}</div>
      </div>

      <div style="margin-top:12px;font-size:25px;font-weight:900;line-height:1.08;display:flex;flex-direction:column;gap:1px;">
        ${wrapText(card.name, 20, 3).map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
      </div>
      <div style="margin-top:10px;font-size:17px;font-weight:700;color:#bae6fd;">${escapeHtml(card.role || card.type)}</div>

      <div style="
        margin-top:16px;
        width:100%;
        height:250px;
        display:flex;
        align-items:center;
        justify-content:center;
        overflow:hidden;
        border-radius:18px;
        border:1px solid rgba(255,255,255,0.12);
        background:${rarity.fill};
        flex-shrink:0;
      ">
        ${artMarkup}
      </div>

      <div style="margin-top:20px;display:flex;gap:6px;flex-shrink:0;">
        ${['ATK', 'DEF', 'SPD', 'SPC', 'HP']
          .map(
            (stat) => `
              <div style="
                width:52px;
                height:64px;
                display:flex;
                flex-direction:column;
                align-items:center;
                justify-content:center;
                border-radius:10px;
                border:1px solid rgba(255,255,255,0.12);
                background:rgba(255,255,255,0.055);
              ">
                <div style="font-size:14px;font-weight:800;color:#94a3b8;">${stat}</div>
                <div style="margin-top:5px;font-size:25px;font-weight:900;">${statValue(card, stat)}</div>
              </div>
            `
          )
          .join('')}
      </div>

      <div style="margin-top:20px;display:flex;flex-direction:column;gap:14px;flex:1 1 auto;min-height:0;">
        ${abilities
          .map(
            (ability: string, index: number) => `
              <div style="
                min-height:92px;
                display:flex;
                flex-direction:column;
                justify-content:center;
                border-radius:12px;
                background:rgba(0,0,0,0.25);
                padding:10px 14px;
                color:#dbeafe;
                font-size:17px;
                font-weight:700;
                line-height:1.22;
                overflow:hidden;
              ">
                ${wrapText(ability, 36, 3).map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
              </div>
            `
          )
          .join('')}
      </div>

      <div style="
        margin-top:20px;
        height:104px;
        display:flex;
        flex-direction:column;
        justify-content:center;
        border-radius:14px;
        border:1px solid rgba(255,255,255,0.09);
        background:rgba(255,255,255,0.045);
        padding:10px 14px;
        color:#cbd5e1;
        font-size:17px;
        font-style:italic;
        line-height:1.25;
        flex-shrink:0;
      ">
        ${flavorLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
      </div>
    </article>
  `;
}

function renderHtml(cards: any[]) {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Quackverse Pack Preview</title>
      <style>
        html, body {
          width: 1800px;
          height: 1040px;
          margin: 0;
          overflow: hidden;
          background: linear-gradient(135deg, #07111f 0%, #172033 52%, #08131f 100%);
          color: #f8fafc;
          font-family: Arial, Helvetica, sans-serif;
        }
        * { box-sizing: border-box; }
      </style>
    </head>
    <body>
      <div style="
        width:1800px;
        height:1040px;
        display:flex;
        flex-direction:column;
        padding:34px;
        overflow:hidden;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;height:48px;">
          <div style="font-size:34px;font-weight:900;">Quackverse Pack</div>
          <div style="font-size:22px;font-weight:700;color:#93c5fd;">SPMT Chat Tag</div>
        </div>
        <div style="margin-top:20px;display:flex;gap:22px;align-items:flex-start;">
          ${cards.map(renderCard).join('')}
        </div>
      </div>
    </body>
  </html>`;
}

export async function GET(req: NextRequest) {
  const ids = String(req.nextUrl.searchParams.get('ids') || '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((id) => Number.isFinite(id) && id > 0)
    .slice(0, 5);

  if (ids.length === 0) {
    return new NextResponse('ids required', { status: 400 });
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
        art: await inlineCardArt(id, fullCard.artHoverUrl || fullCard.artUrl || '', manifest),
      };
    })
  );

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const executablePath = await resolveChromiumExecutable();
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: CHROMIUM_ARGS,
    });

    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.setContent(renderHtml(cards), { waitUntil: 'load' });
    await page.evaluate(async () => {
      const images = Array.from(document.images);
      await Promise.all(
        images.map(
          (img) =>
            img.complete
              ? Promise.resolve()
              : new Promise((resolve) => {
                  img.addEventListener('load', () => resolve(null), { once: true });
                  img.addEventListener('error', () => resolve(null), { once: true });
                })
        )
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fonts = (document as any).fonts;
      if (fonts?.ready) await fonts.ready;
    });

    const screenshot = Buffer.from(await page.screenshot({ type: 'png' }));
    return new NextResponse(screenshot, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('[Quackverse Pack Preview] Failed to render screenshot:', error);
    return NextResponse.json({ error: 'Failed to render pack preview' }, { status: 500 });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
