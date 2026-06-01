import { NextRequest, NextResponse } from 'next/server';
import { fetchTwitchLiveData } from '@/lib/twitch-live-data';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    if (!body) {
      return NextResponse.json({ liveUsers: [], allUsers: [] });
    }

    const { usernames } = JSON.parse(body);
    const data = await fetchTwitchLiveData(Array.isArray(usernames) ? usernames : []);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Twitch Live API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
