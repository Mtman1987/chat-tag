import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { normalizeGameHubChannel } from '@/lib/game-hub-state';
import {
  paintMosaicCell,
  parseMosaicBrushCommand,
  parseMosaicPaintCommand,
  queueMosaicTheme,
  setMosaicBrush,
  validateMosaicTheme,
} from '@/lib/nebula-mosaic';
import { updateAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

function stripPrefix(value: unknown) {
  return String(value || '').trim().replace(/^!?@?spmt(?:\s+|$)/i, '').trim();
}

export async function POST(req: NextRequest) {
  const user = getSessionUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Sign in with SPMT to play.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const channel = normalizeGameHubChannel(body.channel);
  const message = String(body.message || '').trim().slice(0, 400);
  const username = normalizeGameHubChannel(user.twitchUsername);
  if (!channel) return NextResponse.json({ error: 'Choose a stream first.' }, { status: 400 });
  if (!message) return NextResponse.json({ error: 'Type a Mosaic command first.' }, { status: 400 });

  const paint = parseMosaicPaintCommand(message);
  if (paint) {
    const result = await updateAppState((state) => paintMosaicCell(state, {
      channel, userId:user.id, username, displayName:user.twitchUsername, command:paint,
    }));
    return NextResponse.json({ handled:true, reply:`${result.outcome}: ${result.coordinate}`, result });
  }

  const brush = parseMosaicBrushCommand(message);
  if (brush !== null) {
    const result = await updateAppState((state) => setMosaicBrush(state, {
      channel, userId:user.id, username, displayName:user.twitchUsername, brush,
    }));
    return NextResponse.json({ handled:true, reply:`Brush: ${result.brush} ${result.direction}`, result });
  }

  const stripped = stripPrefix(message);
  const themeMatch = stripped.match(/^mosaic\s+(.+)$/i);
  if (themeMatch && !/^(?:remove|drop|reject|clearqueue|clear-queue|queueclear|palette|replay|again|reset|finish|complete|view|show|queue)\b/i.test(themeMatch[1])) {
    const theme = validateMosaicTheme(themeMatch[1]);
    const result = await updateAppState((state) => queueMosaicTheme(state, {
      channel, userId:user.id, username, displayName:user.twitchUsername, theme,
    }));
    return NextResponse.json({ handled:true, reply:`“${theme}” is Mosaic request #${result.position}.`, result });
  }

  return NextResponse.json({ error:'That control belongs to the streamer or moderator.' }, { status:403 });
}
