import { NextResponse } from 'next/server';
import { updateAppState } from '@/lib/volume-store';

export async function POST() {
  try {
    const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
    const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;

    if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
      return NextResponse.json({ error: 'Discord credentials not configured' }, { status: 500 });
    }

    const response = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members?limit=1000`,
      {
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch Discord members' }, { status: 500 });
    }

    const members = await response.json();
    const formattedMembers = members
      .filter((m: any) => !m.user.bot && !m.user.username.startsWith('_'))
      .map((m: any) => ({
        id: m.user.id,
        username: m.user.username,
        avatar: m.user.avatar,
      }));

    let synced = 0;
    await updateAppState((state) => {
      for (const member of formattedMembers) {
        const username = member.username.toLowerCase();
        if (
          username.startsWith('_') ||
          username.includes('.') ||
          username.includes('$') ||
          username.includes('#') ||
          username.includes('[') ||
          username.includes(']') ||
          username.includes('/')
        ) {
          continue;
        }

        state.users[username] = {
          ...(state.users[username] || {}),
          id: username,
          twitchUsername: username,
          discordId: member.id,
          discordUsername: member.username,
          avatar: member.avatar
            ? `https://cdn.discordapp.com/avatars/${member.id}/${member.avatar}.png`
            : '',
          isActive: false,
          lastSeen: new Date().toISOString(),
        };
        synced += 1;
      }
    });

    return NextResponse.json({ success: true, synced });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}