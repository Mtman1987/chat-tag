import { NextRequest, NextResponse } from 'next/server';
import { postOrUpdateGameEmbed } from '@/lib/discord-embed';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret =
    req.headers.get('x-bot-secret') ||
    req.nextUrl.searchParams.get('secret');
  if (secret !== (process.env.BOT_SECRET_KEY || '1234')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await postOrUpdateGameEmbed();
    return NextResponse.json({ success: result.action !== 'skipped', ...result });
  } catch (error: any) {
    console.error('[EmbedRefresh] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
