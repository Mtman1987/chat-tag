import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/auth';
import { makeId, updateAppState } from '@/lib/volume-store';
import { adminActor, appendAdminHistory } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const auth = requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const result = await updateAppState((state) => {
      const entries = Object.entries(state.users);
      const mtman = entries.find(([, user]) => String((user as any).twitchUsername || '').toLowerCase() === 'mtman1987');

      if (!mtman) {
        return { status: 404, error: 'mtman1987 not found' };
      }

      for (const [, user] of entries) {
        (user as any).isIt = false;
      }
      (mtman[1] as any).isIt = true;
      appendAdminHistory(state, {
        action: 'make-me-it',
        performedBy: adminActor(auth.user),
        targetUser: 'mtman1987',
        details: 'Set mtman1987 as it from admin route',
      });

      return { success: true, message: 'mtman1987 is now it!' };
    });

    if ((result as any).error) {
      return NextResponse.json({ error: (result as any).error }, { status: (result as any).status || 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const result = await updateAppState((state) => {
      let previousIt: string | undefined;

      for (const user of Object.values(state.users) as any[]) {
        if (user.isIt) {
          previousIt = user.twitchUsername;
          user.offlineImmunity = true;
        }
        user.isIt = false;
      }

      state.chatTags.push({
        id: makeId('tag'),
        taggerId: 'system',
        taggedId: 'free-for-all',
        streamerId: 'manual-timeout',
        doublePoints: true,
        timestamp: Date.now(),
      });
      appendAdminHistory(state, {
        action: 'manual-timeout',
        performedBy: adminActor(auth.user),
        targetUser: previousIt || '',
        details: previousIt ? `Triggered FFA from ${previousIt}` : 'Triggered FFA with no previous it',
      });

      return {
        success: true,
        previousIt,
        announcement: `🔥 FREE FOR ALL! ${previousIt || 'Someone'} timed out. Anyone can tag for DOUBLE POINTS! 🔥`,
      };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
