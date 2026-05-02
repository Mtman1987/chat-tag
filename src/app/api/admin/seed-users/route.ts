import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/auth';
import { updateAppState } from '@/lib/volume-store';

export async function POST(req: NextRequest) {
  const auth = requireAdminRequest(req);
  if (!auth.ok) return auth.response;
  try {
    const testUsers = [
      {
        id: 'mtman1987',
        twitchUsername: 'mtman1987',
        avatarUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/mtman1987-profile_image-70x70.png',
        score: 0,
        isIt: true,
        isActive: false,
      },
      {
        id: 'spacemountainlive',
        twitchUsername: 'spacemountainlive',
        avatarUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/spacemountainlive-profile_image-70x70.png',
        score: 0,
        isIt: false,
        isActive: false,
      },
    ];

    await updateAppState((state) => {
      for (const user of testUsers) {
        state.users[user.id] = { ...(state.users[user.id] || {}), ...user };
      }
    });

    return NextResponse.json({
      success: true,
      message: `Seeded ${testUsers.length} test users`,
      users: testUsers,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
