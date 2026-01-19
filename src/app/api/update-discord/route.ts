
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import type { GameSettings, AdminPlayer, AdminChatTagEvent, AdminBingoWinEvent } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';

type CombinedEvent = {
    timestamp: Date;
    text: string;
};


export async function POST(req: NextRequest) {
    try {
        const adminApp = initializeAdminApp();
        const db = getFirestore(adminApp);

        // 1. Fetch settings
        const settingsRef = db.collection('gameSettings').doc('default');
        const settingsSnap = await settingsRef.get();
        if (!settingsSnap.exists) {
            throw new Error('Game settings not found.');
        }
        const settings = settingsSnap.data() as GameSettings;
        const { discordWebhookUrl, discordLeaderboardMessageId } = settings;

        if (!discordWebhookUrl || !discordLeaderboardMessageId) {
            return NextResponse.json({ message: 'Discord webhook URL or message ID not configured.' }, { status: 200 });
        }

        // 2. Fetch all necessary data
        const usersSnap = await db.collection('users').orderBy('score', 'desc').get();
        const players = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminPlayer));

        const tagsSnap = await db.collection('chatTags').orderBy('timestamp', 'desc').limit(5).get();
        const tagEvents = tagsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminChatTagEvent));

        const bingoWinsSnap = await db.collection('bingoEvents').orderBy('timestamp', 'desc').limit(5).get();
        const bingoWinEvents = bingoWinsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminBingoWinEvent));
        
        const bingoCardsCompleted = settings.bingoCardsCompleted ?? 0;

        // 3. Process and combine events
        const getPlayerName = (id: string) => players.find(p => p.id === id)?.twitchUsername || 'A player';

        const combinedEvents: CombinedEvent[] = [];

        tagEvents.forEach(event => {
            if (event.timestamp) {
                combinedEvents.push({
                    timestamp: event.timestamp.toDate(),
                    text: `🎯 ${getPlayerName(event.taggerId)} tagged ${getPlayerName(event.taggedId)} in ${getPlayerName(event.streamerId)}'s stream.`
                });
            }
        });
        
        bingoWinEvents.forEach(event => {
            if (event.timestamp) {
                combinedEvents.push({
                    timestamp: event.timestamp.toDate(),
                    text: `🎉 ${getPlayerName(event.userId)} got BINGO for ${event.points} points!`
                });
            }
        });

        const sortedEvents = combinedEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 5);

        // 4. Construct the embed
        const topTenPlayers = players.slice(0, 10);
        const leaderboardString = topTenPlayers.map((p, i) => {
            const rank = i + 1;
            let icon = '🔹';
            if (rank === 1) icon = '🏆';
            if (rank === 2) icon = '🥈';
            if (rank === 3) icon = '🥉';
            return `**${rank}.** ${icon} ${p.twitchUsername} - **${p.score.toLocaleString()}** pts`;
        }).join('\n') || 'No players yet.';

        const eventString = sortedEvents.map(e => `> ${e.text} *(${formatDistanceToNow(e.timestamp, { addSuffix: true })})*`).join('\n') || '> No recent events.';

        const discordPayload = {
            embeds: [{
                title: "🏆 Astro Twitch Clash Live Stats 🏆",
                description: `Community Bingos Completed: **${bingoCardsCompleted}**`,
                color: 0xdb2777, // Tailwind's `pink-600`
                fields: [
                    {
                        name: "Leaderboard",
                        value: leaderboardString,
                        inline: true
                    },
                    {
                        name: "Recent Activity",
                        value: eventString,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString(),
                footer: {
                    text: "This message updates automatically with game events."
                }
            }]
        };

        // 5. Send the PATCH request to Discord
        const editUrl = `${discordWebhookUrl}/messages/${discordLeaderboardMessageId}`;
        const response = await fetch(editUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(discordPayload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Discord API Error:', errorText);
            throw new Error(`Failed to update Discord message. Status: ${response.status}`);
        }

        return NextResponse.json({ success: true, message: 'Discord leaderboard updated.' });

    } catch (error: any) {
        console.error('Error updating Discord leaderboard:', error);
        return NextResponse.json(
            { error: `Failed to update Discord: ${error.message}` },
            { status: 500 }
        );
    }
}
