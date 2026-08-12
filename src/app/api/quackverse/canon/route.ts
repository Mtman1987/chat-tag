import { NextResponse } from 'next/server';
import { quackverseCards } from '@/lib/quackverse-data';
import { getQuackverseVisualCanon, QUACKVERSE_CANON_ART_STYLE } from '@/lib/quackverse-visual-canon';

export const dynamic = 'force-dynamic';

export async function GET() {
  const characters = quackverseCards
    .filter((card) => card.type === 'Duck' && card.id <= 80)
    .map((card) => getQuackverseVisualCanon(card));

  return NextResponse.json({
    artStyle: QUACKVERSE_CANON_ART_STYLE,
    characterCount: characters.length,
    characters,
  });
}
