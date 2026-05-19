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
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      let closed = false;
      let lastUpdatedAt = '';

      send('ready', { ok: true });

      const roomKey = quackverseRoomKeyFromParams(req.nextUrl.searchParams);
      const scopedRoom = Boolean(quackverseScopeFromParams(req.nextUrl.searchParams));

      const sendLatestState = async () => {
        if (closed) return;
        try {
          const appState = await readAppState();
          const raw = appState.quackverseRooms?.[roomKey] || (!scopedRoom ? appState.quackverse : {});
          const state = normalizeQuackverseState(raw as Partial<QuackverseSavedState>);

          if (state.updatedAt === lastUpdatedAt) return;
          lastUpdatedAt = state.updatedAt;
          const viewer = viewerPayload(sessionUser, state);
          const seat = viewer?.seat || getClaimedSeat(state, viewerUserId);
          send('state', redactQuackverseStateForViewer(state, seat));

        } catch (error) {
          send('error', { message: 'Failed to read Quackverse state' });
        }
      };

      void sendLatestState();

      const statePoll = setInterval(() => {
        void sendLatestState();
      }, 1000);

      const heartbeat = setInterval(() => {
        send('ping', { at: Date.now() });
      }, 25000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(statePoll);
        clearInterval(heartbeat);
        controller.close();
      });
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
