import { NextResponse } from 'next/server';
import { getRuntimePublicValueWithDevFallback } from '@/lib/runtime-config.server';

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_GUILD_ID = getRuntimePublicValueWithDevFallback(
  'discordGuildId',
  ['DISCORD_GUILD_ID'],
  ''
);

export async function GET() {
  if (!DISCORD_BOT_TOKEN) {
    console.error('[Discord Members] No bot token configured');
    return NextResponse.json({ members: [] });
  }
  if (!/^\d{17,20}$/.test(DISCORD_GUILD_ID)) {
    return NextResponse.json({
      members: [],
      warning: 'Discord guild id is not configured correctly',
    });
  }

  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members?limit=1000`,
      {
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Discord Members] ${response.status} error:`, errorText);
      return NextResponse.json({ members: [], error: `${response.status}: ${errorText}` });
    }

    const members = await response.json();
    const formattedMembers = members
      .filter((m: any) => !m.user.bot)
      .map((m: any) => ({
        id: m.user.id,
        username: m.user.username,
        displayName: m.nick || m.user.global_name || m.user.username,
        avatar: m.user.avatar,
      }));

    console.log(`[Discord Members] Fetched ${formattedMembers.length} members`);
    return NextResponse.json({ members: formattedMembers });
  } catch {
    return NextResponse.json({ members: [] });
  }
}
