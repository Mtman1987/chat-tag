import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/auth';
import { quackverseCards } from '@/lib/quackverse-data';
import { getQuackverseVisualCanon } from '@/lib/quackverse-visual-canon';
import type { QuackverseArtVariant } from '@/lib/quackverse-art';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function canonAsset(cardId: number) {
  return {
    fileName: `builtin/${cardId}.svg`,
    mimeType: 'image/svg+xml',
    originalName: `quackverse-canon-${cardId}.svg`,
    updatedAt: 'canon-v2',
    url: `/api/quackverse/art/canon?cardId=${cardId}`,
    builtIn: true,
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

  const limit = Math.max(1, Math.min(101, Number(body?.limit || 1) || 1));
  const requestedIds = Array.isArray(body?.cardIds)
    ? body.cardIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id))
    : [];

  const candidates = quackverseCards
    .filter((card) => requestedIds.length === 0 || requestedIds.includes(card.id))
    .slice(0, limit);

  const results = candidates.map((card) => {
    const canon = card.type === 'Duck' ? getQuackverseVisualCanon(card) : null;
    return {
      cardId: card.id,
      name: card.name,
      variant,
      success: true,
      provider: 'built-in-canon',
      asset: canonAsset(card.id),
      sourceUrl: `/api/quackverse/art/canon?cardId=${card.id}`,
      canon: canon
        ? {
            family: canon.family,
            species: canon.species,
            affinity: canon.affinity,
            className: canon.className,
            subclass: canon.subclass,
            signatureWeapon: canon.signatureWeapon,
            palette: canon.palette,
          }
        : { family: 'Gear', className: 'Equipment' },
    };
  });

  return NextResponse.json({
    success: true,
    variant,
    count: results.length,
    results,
    complete: true,
    note: variant === 'hover'
      ? 'Quackverse is complete without animated assets. Hover currently uses the same permanent canon artwork; optional FFmpeg animation may be added later without changing the static canon.'
      : 'Every Quackverse card uses permanent built-in canon artwork. No external image provider is required.',
  });
}
