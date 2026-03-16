import { NextResponse } from 'next/server';
import { updateAppState } from '@/lib/volume-store';

export async function POST() {
  try {
    const phrases = [
      'First donation', 'Chat spams emotes', 'Technical difficulties', 'Raid incoming', 'Clip it!',
      'Streamer forgets to unmute', 'Viewer asks about setup', 'Streamer takes a break', 'Chat goes into sub-only mode', 'Streamer reads chat',
      'Hype train starts', 'Streamer laughs at chat', 'FREE SPACE', 'Streamer gets sniped', 'Chat argues in emotes',
      'Streamer checks Discord', 'New follower alert', 'Streamer drinks water', 'Chat spams F', 'Streamer adjusts camera',
      'Viewer asks for song name', 'Streamer mentions schedule', 'Chat spams LUL', 'Streamer thanks subs', 'Viewer lurks',
    ];

    await updateAppState((state) => {
      state.bingoCards.current_user = {
        phrases,
        covered: {},
        updatedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json({ success: true, phrases });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}