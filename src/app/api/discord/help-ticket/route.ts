import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { dataDirPath } from '@/lib/volume-store';

export async function POST(req: NextRequest) {
  try {
    const { requester, requesterId, channel, note } = await req.json();
    console.log('[help-ticket] Request:', { requester, requesterId, channel, note });

    if (!requester || !channel) {
      return NextResponse.json({ error: 'requester and channel are required' }, { status: 400 });
    }

    const webhookUrl = process.env.DISCORD_TAG_WEBHOOK_URL || 'https://discord.com/api/webhooks/1463633328816128042/n0nTDt7yIyy_NO1i_2VeRVrf9w91dgulYShbXZ_qZzGVKUEvL_Xoebna8vNrH6SSsBbn';
    console.log('[help-ticket] Using webhook:', webhookUrl.substring(0, 50) + '...');

    // Get current game state
    console.log('[help-ticket] Fetching game state...');
    const appOrigin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const stateResponse = await fetch(`${appOrigin}/api/tag`);
    const gameState = await stateResponse.json();
    console.log('[help-ticket] Game state fetched, players:', gameState?.players?.length);
    const itPlayer = gameState?.players?.find((p: any) => p.isIt);
    const itName = itPlayer ? (itPlayer.twitchUsername || itPlayer.username || 'Unknown') : 'FREE FOR ALL';
    const requesterPlayer = gameState?.players?.find((p: any) => 
      (p.twitchUsername || p.username || '').toLowerCase() === requester.toLowerCase()
    );
    
    const totalPlayers = gameState?.players?.length || 0;
    const sorted = (gameState?.players || []).sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
    const requesterRank = requesterPlayer ? sorted.findIndex((p: any) => p.id === requesterPlayer.id) + 1 : 'N/A';
    const requesterScore = requesterPlayer?.score || 0;
    const requesterStatus = requesterPlayer?.isSleeping ? '😴 Sleeping' : 
                           requesterPlayer?.offlineImmunity ? '🔒 Offline' :
                           requesterPlayer?.timedImmunityUntil && requesterPlayer.timedImmunityUntil > Date.now() ? '⏱️ Immune' :
                           '✅ Active';
    
    const itDuration = gameState?.lastTagTime ? 
      Math.floor((Date.now() - gameState.lastTagTime) / 60000) : 0;

    // Get ticket history for this user
    const statePath = path.join(dataDirPath(), 'app-state.json');
    const stateData = JSON.parse(await fs.readFile(statePath, 'utf-8'));
    const allTickets = Object.values(stateData.supportTickets || {}) as any[];
    const userTickets = allTickets.filter((t: any) => t.requester.toLowerCase() === requester.toLowerCase());
    const totalTickets = userTickets.length;
    const resolvedTickets = userTickets.filter((t: any) => t.resolved);
    const lastResolved = resolvedTickets.sort((a: any, b: any) => 
      new Date(b.resolvedAt || 0).getTime() - new Date(a.resolvedAt || 0).getTime()
    )[0];

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const ticketNum = totalTickets + 1;
    
    // Truncate long values to fit Discord limits
    const truncate = (str: string, max: number) => str.length > max ? str.substring(0, max - 3) + '...' : str;
    const issueText = truncate(note || 'Not specified', 1000);
    const lastResolvedText = lastResolved ? truncate(`${new Date(lastResolved.resolvedAt).toLocaleString()} - ${lastResolved.note || 'No issue specified'}`, 1000) : null;
    
    console.log('[help-ticket] Posting to Discord, ticket #', ticketNum);
    const response = await fetch(`${webhookUrl}?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `🆘 Support Request #${ticketNum}`,
          color: 0xff0000,
          fields: [
            { name: 'User', value: `${requester} (Rank #${requesterRank}/${totalPlayers})`, inline: true },
            { name: 'Score', value: `${requesterScore} pts`, inline: true },
            { name: 'Status', value: requesterStatus, inline: true },
            { name: 'Channel', value: `twitch.tv/${channel}`, inline: false },
            { name: 'Current It', value: `${itName} (${itDuration}m)`, inline: true },
            { name: 'Ticket History', value: `${totalTickets} total (${resolvedTickets.length} resolved)`, inline: true },
            lastResolvedText ? { name: 'Last Resolved', value: lastResolvedText, inline: false } : null,
            { name: 'Issue', value: issueText, inline: false },
            { name: 'Links', value: `[View Logs](${appUrl}/api/logs) | [Close](${appUrl}/api/discord/close-ticket?id=PLACEHOLDER)`, inline: false },
          ].filter(Boolean),
          timestamp: new Date().toISOString(),
        }]
      }),
    });

    console.log('[help-ticket] Discord response status:', response.status);
    if (!response.ok) {
      const text = await response.text();
      console.error('[help-ticket] Discord error:', text);
      
      // If rate limited, still save ticket and return success
      if (response.status === 429) {
        console.log('[help-ticket] Rate limited by Discord, saving ticket anyway');
        const fakeId = `ticket_${Date.now()}`;
        if (!stateData.supportTickets) stateData.supportTickets = {};
        stateData.supportTickets[fakeId] = {
          requester,
          requesterId: requesterId || null,
          channel,
          note: note || null,
          messageId: fakeId,
          itPlayer: itName,
          createdAt: new Date().toISOString(),
          resolved: false,
        };
        await fs.writeFile(statePath, JSON.stringify(stateData, null, 2));
        return NextResponse.json({ success: true, messageId: fakeId, rateLimited: true });
      }
      
      return NextResponse.json({ error: `Discord webhook failed: ${text}` }, { status: 500 });
    }

    const data = await response.json();
    const messageId = data?.id;
    console.log('[help-ticket] Message posted, ID:', messageId);

    if (messageId) {
      console.log('[help-ticket] Updating message with real ID...');
      await fetch(`${webhookUrl}/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: `🆘 Support Request #${ticketNum}`,
            color: 0xff0000,
            fields: [
              { name: 'User', value: `${requester} (Rank #${requesterRank}/${totalPlayers})`, inline: true },
              { name: 'Score', value: `${requesterScore} pts`, inline: true },
              { name: 'Status', value: requesterStatus, inline: true },
              { name: 'Channel', value: `twitch.tv/${channel}`, inline: false },
              { name: 'Current It', value: `${itName} (${itDuration}m)`, inline: true },
              { name: 'Ticket History', value: `${totalTickets} total (${resolvedTickets.length} resolved)`, inline: true },
              lastResolvedText ? { name: 'Last Resolved', value: lastResolvedText, inline: false } : null,
              { name: 'Issue', value: issueText, inline: false },
              { name: 'Links', value: `[View Logs](${appUrl}/api/logs) | [Close](${appUrl}/api/discord/close-ticket?id=${messageId})`, inline: false },
            ].filter(Boolean),
            timestamp: new Date().toISOString(),
          }]
        })
      });

      // Save ticket to app-state.json
      console.log('[help-ticket] Saving ticket to app-state.json...');
      if (!stateData.supportTickets) stateData.supportTickets = {};
      stateData.supportTickets[messageId] = {
        requester,
        requesterId: requesterId || null,
        channel,
        note: note || null,
        messageId,
        itPlayer: itName,
        createdAt: new Date().toISOString(),
        resolved: false,
      };
      
      await fs.writeFile(statePath, JSON.stringify(stateData, null, 2));
      console.log('[help-ticket] Ticket saved successfully');
    }

    console.log('[help-ticket] Returning success');
    return NextResponse.json({ success: true, messageId });
  } catch (error: any) {
    console.error('[help-ticket] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
