import { NextRequest, NextResponse } from 'next/server';
import { makeId, updateAppState } from '@/lib/volume-store';

export async function POST(_request: NextRequest) {
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

export async function PUT(_request: NextRequest) {
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