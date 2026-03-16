'use server';

import { NextRequest, NextResponse } from 'next/server';
import { formatDistanceToNow } from 'date-fns';
import { readAppState, toMillis } from '@/lib/volume-store';

type CombinedEvent = {
  timestamp: Date;
  text: string;
};

export async function POST(_req: NextRequest) {
  try {
    const state = await readAppState();

    const settings = state.gameSettings.default || {};
    const { discordWebhookUrl, discordLeaderboardMessageId } = settings;

    if (!discordWebhookUrl || !discordLeaderboardMessageId) {
      return NextResponse.json({ message: 'Discord webhook URL or message ID not configured.' }, { status: 200 });
    }

    const players = Object.values(state.users).sort((a: any, b: any) => (b.score || 0) - (a.score || 0)) as any[];

    const tagEvents = [...state.chatTags]
      .sort((a: any, b: any) => (toMillis(b.timestamp) || 0) - (toMillis(a.timestamp) || 0))
      .slice(0, 5);

    const bingoWinEvents = [...state.bingoEvents]
      .sort((a: any, b: any) => (toMillis(b.timestamp) || 0) - (toMillis(a.timestamp) || 0))
      .slice(0, 5);

    const bingoCardsCompleted = settings.bingoCardsCompleted ?? 0;

    const getPlayerName = (id: string) => players.find((p: any) => p.id === id)?.twitchUsername || id || 'A player';

    const combinedEvents: CombinedEvent[] = [];

    for (const event of tagEvents) {
      const ts = toMillis((event as any).timestamp);
      if (!ts) continue;
      combinedEvents.push({
        timestamp: new Date(ts),
        text: `🎯 ${getPlayerName((event as any).taggerId)} tagged ${getPlayerName((event as any).taggedId)} in ${getPlayerName((event as any).streamerId)}'s stream.`,
      });
    }

    for (const event of bingoWinEvents) {
      const ts = toMillis((event as any).timestamp);
      if (!ts) continue;
      combinedEvents.push({
        timestamp: new Date(ts),
        text: `🎉 ${getPlayerName((event as any).userId)} got BINGO for ${(event as any).points} points!`,
      });
    }

    const sortedEvents = combinedEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 5);

    const topTenPlayers = players.slice(0, 10);
    const leaderboardString =
      topTenPlayers
        .map((p: any, i: number) => {
          const rank = i + 1;
          let icon = '🔹';
          if (rank === 1) icon = '🏆';
          if (rank === 2) icon = '🥈';
          if (rank === 3) icon = '🥉';
          return `**${rank}.** ${icon} ${p.twitchUsername} - **${(p.score || 0).toLocaleString()}** pts`;
        })
        .join('\n') || 'No players yet.';

    const eventString =
      sortedEvents
        .map((e) => `> ${e.text} *(${formatDistanceToNow(e.timestamp, { addSuffix: true })})*`)
        .join('\n') || '> No recent events.';

    const discordPayload = {
      embeds: [
        {
          title: '🏆 Astro Twitch Clash Live Stats 🏆',
          description: `Community Bingos Completed: **${bingoCardsCompleted}**`,
          color: 0xdb2777,
          fields: [
            {
              name: 'Leaderboard',
              value: leaderboardString,
              inline: true,
            },
            {
              name: 'Recent Activity',
              value: eventString,
              inline: true,
            },
          ],
          timestamp: new Date().toISOString(),
          footer: {
            text: 'This message updates automatically with game events.',
          },
        },
      ],
    };

    const editUrl = `${discordWebhookUrl}/messages/${discordLeaderboardMessageId}`;
    const response = await fetch(editUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update Discord message. Status: ${response.status}. ${errorText}`);
    }

    return NextResponse.json({ success: true, message: 'Discord leaderboard updated.' });
  } catch (error: any) {
    return NextResponse.json({ error: `Failed to update Discord: ${error.message}` }, { status: 500 });
  }
}