import { NextRequest, NextResponse } from 'next/server';
import { quackverseCards } from '@/lib/quackverse-data';
import { getQuackverseVisualCanon } from '@/lib/quackverse-visual-canon';
import { normalizeQuackverseArtManifest } from '@/lib/quackverse-art';
import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const affinityColors: Record<string, [string, string, string]> = {
  Radiant: ['#f8fafc', '#67e8f9', '#facc15'],
  Cosmic: ['#111827', '#7c3aed', '#22d3ee'],
  Eclipse: ['#050816', '#312e81', '#a855f7'],
  Solar: ['#160b05', '#f97316', '#facc15'],
  Frost: ['#082f49', '#7dd3fc', '#f8fafc'],
  Storm: ['#111827', '#3b82f6', '#f8fafc'],
  Tide: ['#042f2e', '#0ea5e9', '#67e8f9'],
  Gale: ['#1f2937', '#84cc16', '#7dd3fc'],
  Forge: ['#1c1917', '#b45309', '#fb923c'],
  Meteor: ['#1c1917', '#991b1b', '#f97316'],
  Gear: ['#111827', '#d97706', '#fbbf24'],
};

function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function equipmentAffinity(name: string) {
  const text = name.toLowerCase();
  if (/eclipse|void/.test(text)) return 'Eclipse';
  if (/solar|starflare/.test(text)) return 'Solar';
  if (/frost|lunar/.test(text)) return 'Frost';
  if (/thunder/.test(text)) return 'Storm';
  if (/nebula|cosmic|star/.test(text)) return 'Cosmic';
  if (/meteor|gravity/.test(text)) return 'Meteor';
  return 'Gear';
}

function iconForEquipment(name: string) {
  const text = name.toLowerCase();
  if (/blade|fang/.test(text)) return 'blade';
  if (/shield|buckler|bracer|armor/.test(text)) return 'shield';
  if (/boot/.test(text)) return 'boots';
  if (/hammer/.test(text)) return 'hammer';
  if (/lens|beacon|battery|stabilizer|injector/.test(text)) return 'device';
  if (/gauntlet|wrap/.test(text)) return 'gauntlet';
  return 'amulet';
}

function equipmentShape(icon: string, c1: string, c2: string) {
  if (icon === 'blade') return `<path d="M625 190 L720 270 L465 610 L395 540 Z" fill="${c1}" stroke="${c2}" stroke-width="18"/><path d="M405 535 L330 610" stroke="${c2}" stroke-width="24"/><circle cx="314" cy="626" r="30" fill="${c1}" stroke="${c2}" stroke-width="12"/>`;
  if (icon === 'shield') return `<path d="M510 175 L700 245 L665 520 Q610 655 510 705 Q410 655 355 520 L320 245 Z" fill="${c1}" stroke="${c2}" stroke-width="18"/><path d="M510 225 L510 640" stroke="${c2}" stroke-width="16"/><path d="M375 385 L645 385" stroke="${c2}" stroke-width="16"/>`;
  if (icon === 'boots') return `<path d="M345 245 H495 V500 Q455 565 330 555 L250 520 L280 450 H360 Z" fill="${c1}" stroke="${c2}" stroke-width="16"/><path d="M540 225 H680 V485 Q650 555 535 550 L460 510 L490 440 H565 Z" fill="${c1}" stroke="${c2}" stroke-width="16"/>`;
  if (icon === 'hammer') return `<rect x="330" y="210" width="360" height="150" rx="28" fill="${c1}" stroke="${c2}" stroke-width="18"/><rect x="480" y="340" width="70" height="330" rx="24" fill="${c2}"/>`;
  if (icon === 'device') return `<circle cx="510" cy="420" r="190" fill="${c1}" stroke="${c2}" stroke-width="18"/><circle cx="510" cy="420" r="95" fill="none" stroke="${c2}" stroke-width="20"/><path d="M510 180 V250 M510 590 V660 M270 420 H340 M680 420 H750" stroke="${c2}" stroke-width="20"/>`;
  if (icon === 'gauntlet') return `<path d="M360 255 L565 210 L665 360 L610 565 L420 610 L315 470 Z" fill="${c1}" stroke="${c2}" stroke-width="18"/><path d="M390 290 L430 475 M455 270 L490 460 M520 250 L550 445 M585 250 L610 425" stroke="${c2}" stroke-width="16"/>`;
  return `<path d="M510 230 C360 230 330 420 510 650 C690 420 660 230 510 230 Z" fill="${c1}" stroke="${c2}" stroke-width="18"/><circle cx="510" cy="390" r="70" fill="none" stroke="${c2}" stroke-width="20"/>`;
}

function duckSvg(card: any) {
  const canon = getQuackverseVisualCanon(card);
  const [bg, primary, accent] = affinityColors[canon.affinity] || affinityColors.Radiant;
  const classScale = canon.className === 'Tank' ? 1.12 : canon.className === 'Assassin' || canon.className === 'Scout' ? 0.92 : 1;
  const cloak = canon.className === 'Mystic' || canon.className === 'Support' || canon.className === 'Medic' || canon.className === 'Diplomat';
  const seed = (card.id * 37) % 360;
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <radialGradient id="bg" cx="50%" cy="35%"><stop offset="0%" stop-color="${accent}" stop-opacity=".45"/><stop offset="58%" stop-color="${primary}" stop-opacity=".28"/><stop offset="100%" stop-color="${bg}"/></radialGradient>
      <linearGradient id="armor" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${primary}"/><stop offset="1" stop-color="${accent}"/></linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="14" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="1024" height="1024" fill="url(#bg)"/>
    <g opacity=".55">${Array.from({length:18},(_,i)=>`<circle cx="${80 + ((i*97 + seed)%880)}" cy="${70 + ((i*149 + seed)%700)}" r="${2 + (i%4)}" fill="${i%3===0?accent:'#fff'}"/>`).join('')}</g>
    <circle cx="512" cy="470" r="300" fill="none" stroke="${accent}" stroke-opacity=".28" stroke-width="12"/>
    ${cloak ? `<path d="M350 455 Q250 640 300 865 Q512 760 724 865 Q774 640 674 455" fill="${bg}" opacity=".82" stroke="${accent}" stroke-width="10"/>` : ''}
    <g transform="translate(512 505) scale(${classScale}) translate(-512 -505)">
      <ellipse cx="512" cy="585" rx="180" ry="245" fill="#2b2b35" stroke="${accent}" stroke-width="10"/>
      <path d="M345 560 Q512 430 679 560 L640 785 Q512 845 384 785 Z" fill="url(#armor)" stroke="${accent}" stroke-width="14"/>
      <ellipse cx="512" cy="330" rx="128" ry="140" fill="#d8d2bd" stroke="${accent}" stroke-width="10"/>
      <path d="M585 330 Q710 345 765 390 Q690 440 575 408 Z" fill="#e5a642" stroke="#6b3f10" stroke-width="9"/>
      <circle cx="470" cy="307" r="15" fill="#111827"/><circle cx="475" cy="302" r="5" fill="#fff"/>
      <path d="M405 370 Q512 420 620 370" fill="none" stroke="${primary}" stroke-width="15" opacity=".9"/>
      <path d="M405 510 L320 675" stroke="${accent}" stroke-width="28" stroke-linecap="round"/><path d="M620 510 L720 675" stroke="${accent}" stroke-width="28" stroke-linecap="round"/>
      <path d="M440 790 L395 955 M580 790 L630 955" stroke="#252735" stroke-width="42" stroke-linecap="round"/>
      <path d="M375 950 H465 M585 950 H680" stroke="${accent}" stroke-width="28" stroke-linecap="round"/>
      <path d="M345 565 L260 470 M678 565 L760 460" stroke="${accent}" stroke-width="18"/>
    </g>
    <g filter="url(#glow)" opacity=".9"><path d="M165 790 Q320 690 405 730" fill="none" stroke="${accent}" stroke-width="14"/><path d="M835 750 Q690 640 625 710" fill="none" stroke="${primary}" stroke-width="14"/></g>
    <rect x="58" y="760" width="908" height="205" rx="34" fill="#020617" fill-opacity=".82" stroke="${accent}" stroke-opacity=".7"/>
    <text x="92" y="820" fill="#fff" font-family="Arial, sans-serif" font-size="42" font-weight="700">${esc(card.name)}</text>
    <text x="92" y="865" fill="${accent}" font-family="Arial, sans-serif" font-size="26">${esc(canon.family)} · ${esc(canon.className)} · ${esc(canon.affinity)}</text>
    <text x="92" y="905" fill="#cbd5e1" font-family="Arial, sans-serif" font-size="23">${esc(canon.species)} · ${esc(canon.subclass)}</text>
    <text x="92" y="940" fill="#94a3b8" font-family="Arial, sans-serif" font-size="20">${esc(canon.signatureWeapon)}</text>
  </svg>`;
}

function equipmentSvg(card: any) {
  const affinity = equipmentAffinity(card.name);
  const [bg, primary, accent] = affinityColors[affinity] || affinityColors.Gear;
  const icon = iconForEquipment(card.name);
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs><radialGradient id="bg"><stop stop-color="${primary}" stop-opacity=".5"/><stop offset="1" stop-color="${bg}"/></radialGradient><filter id="g"><feGaussianBlur stdDeviation="14" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <rect width="1024" height="1024" fill="url(#bg)"/>
    <circle cx="512" cy="420" r="310" fill="none" stroke="${accent}" stroke-width="10" stroke-opacity=".35"/>
    <g filter="url(#g)">${equipmentShape(icon, primary, accent)}</g>
    <rect x="58" y="760" width="908" height="205" rx="34" fill="#020617" fill-opacity=".84" stroke="${accent}" stroke-opacity=".7"/>
    <text x="92" y="825" fill="#fff" font-family="Arial, sans-serif" font-size="42" font-weight="700">${esc(card.name)}</text>
    <text x="92" y="872" fill="${accent}" font-family="Arial, sans-serif" font-size="27">Gear · ${esc(affinity)} family</text>
    <text x="92" y="918" fill="#cbd5e1" font-family="Arial, sans-serif" font-size="24">${esc(card.effect || 'Quackverse equipment')}</text>
  </svg>`;
}

export async function GET(req: NextRequest) {
  const cardId = Number(req.nextUrl.searchParams.get('cardId'));
  const card = quackverseCards.find((item) => item.id === cardId);
  if (!card) return NextResponse.json({ error: 'Card not found.' }, { status: 404 });
  const state = await readAppState();
  const manifest = normalizeQuackverseArtManifest(state?.gameSettings?.default?.quackverseArt);
  const asset = manifest[String(card.id)]?.static;
  if (asset?.fileName) {
    const persistedUrl = new URL(`/api/quackverse/art/file?cardId=${card.id}&variant=static&t=${encodeURIComponent(asset.updatedAt)}`, req.nextUrl.origin);
    const response = NextResponse.redirect(persistedUrl, 307);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Quackverse-Art-Source', 'persisted');
    return response;
  }

  const svg = card.type === 'Equipment' ? equipmentSvg(card) : duckSvg(card);
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Quackverse-Art-Source': 'canonical-built-in',
    },
  });
}
