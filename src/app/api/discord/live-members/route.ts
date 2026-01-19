import { NextRequest, NextResponse } from 'next/server';

const STREAMWEAVER2_URL = process.env.STREAMWEAVER2_URL || 'http://localhost:8090';

export async function GET(request: NextRequest) {
  try {
    // Get Discord members from StreamWeaver2
    const membersResponse = await fetch(`${STREAMWEAVER2_URL}/api/discord/members`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!membersResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch Discord members' }, { status: 500 });
    }

    const { members } = await membersResponse.json();
    
    // Extract usernames (assuming Discord usernames match Twitch usernames)
    const usernames = members
      .map((member: any) => member.username)
      .filter((username: string) => username && !username.includes('bot'));

    if (usernames.length === 0) {
      return NextResponse.json({ liveMembers: [] });
    }

    // Check which ones are live on Twitch
    const liveResponse = await fetch(`${STREAMWEAVER2_URL}/api/twitch/live`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ usernames })
    });

    if (!liveResponse.ok) {
      return NextResponse.json({ error: 'Failed to check live status' }, { status: 500 });
    }

    const { liveUsers } = await liveResponse.json();

    // Combine Discord member info with Twitch live info
    const liveMembers = liveUsers.map((liveUser: any) => {
      const discordMember = members.find((member: any) => 
        member.username.toLowerCase() === liveUser.username.toLowerCase()
      );
      
      return {
        discordId: discordMember?.id,
        discordUsername: discordMember?.username,
        discordDisplayName: discordMember?.displayName,
        twitchUsername: liveUser.username,
        twitchDisplayName: liveUser.displayName,
        streamTitle: liveUser.title,
        gameName: liveUser.gameName,
        viewerCount: liveUser.viewerCount,
        thumbnailUrl: liveUser.thumbnailUrl
      };
    });

    return NextResponse.json({ liveMembers });
  } catch (error) {
    console.error('[Discord Live Members] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}