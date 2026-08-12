import { NextRequest } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { getClaimedSeat, quackverseUserIdFromSession, redactQuackverseStateForViewer, viewerPayload } from '@/lib/quackverse-access';
import { quackverseRoomKeyFromParams, quackverseScopeFromParams } from '@/lib/quackverse-rooms';
import { readAppState } from '@/lib/volume-store';
import { normalizeQuackverseState, type QuackverseSavedState } from '@/lib/quackverse-state';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const sessionUser = getSessionUserFromRequest(req);
  const viewerUserId = quackverseUserIdFromSession(sessionUser);

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let lastUpdatedAt = '';
      let statePoll: ReturnType<typeof setInterval> | null = null;
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (statePoll) clearInterval(statePoll);
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // The runtime may already have closed the controller after a client disconnect.
        }
      };

      const send = (event: string, data: unknown) => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          return true;
        } catch {
          cleanup();
          return false;
        }
      };

      send('ready', { ok: true });

      const roomKey = quackverseRoomKeyFromParams(req.nextUrl.searchParams);
      const scopedRoom = Boolean(quackverseScopeFromParams(req.nextUrl.searchParams));

      const sendLatestState = async () => {
        if (closed) return;
        try {
          const appState = await readAppState();
          if (closed) return;
          const raw = appState.quackverseRooms?.[roomKey] || (!scopedRoom ? appState.quackverse : {});
          const state = normalizeQuackverseState(raw as Partial<QuackverseSavedState>);

          if (state.updatedAt === lastUpdatedAt) return;
          lastUpdatedAt = state.updatedAt;
          const viewer = viewerPayload(sessionUser, state);
          const seat = viewer?.seat || getClaimedSeat(state, viewerUserId);
          send('state', redactQuackverseStateForViewer(state, seat));
        } catch {
          if (!closed) send('error', { message: 'Failed to read Quackverse state' });
        }
      };

      void sendLatestState();

      statePoll = setInterval(() => {
        void sendLatestState();
      }, 1000);

      heartbeat = setInterval(() => {
        send('ping', { at: Date.now() });
      }, 25000);

      req.signal.addEventListener('abort', cleanup, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
    },
  });
}
