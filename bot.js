const tmi = require('tmi.js');
const fs = require('fs');
const path = require('path');

// Load environment variables
const env = process.env;

const API_BASE = process.env.API_BASE || 'https://chat-tag.fly.dev';
const BLACKLIST = ['streamelements', 'nightbot', 'moobot', 'fossabot'];
const AUTO_ROTATE_MINUTES = 40;
const STALE_LAST_TAG_HOURS = 6;

async function refreshToken(refreshToken, clientId, clientSecret) {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    })
  });
  return res.json();
}

async function updateEnvToken(key, value) {
  // In production, tokens are managed via secrets
  console.log(`[Bot] Token refresh: ${key} updated`);
}

async function getValidToken() {
  const clientId = env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
  const clientSecret = env.TWITCH_CLIENT_SECRET;
  const token = env.TWITCH_BOT_TOKEN;
  const refreshTokenValue = env.TWITCH_BOT_REFRESH_TOKEN;
  
  const validateRes = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: { 'Authorization': `OAuth ${token}` }
  });
  
  if (validateRes.ok) {
    console.log('[Bot] Token is valid');
    return token;
  }
  
  console.log('[Bot] Token expired, refreshing...');
  const data = await refreshToken(refreshTokenValue, clientId, clientSecret);
  
  if (data.access_token) {
    await updateEnvToken('TWITCH_BOT_TOKEN', data.access_token);
    if (data.refresh_token) {
      await updateEnvToken('TWITCH_BOT_REFRESH_TOKEN', data.refresh_token);
    }
    console.log('[Bot] Token refreshed successfully');
    return data.access_token;
  }
  
  throw new Error('Failed to refresh token');
}

async function apiCall(endpoint, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    return await res.json();
  } catch (e) {
    console.error(`[API Error] ${endpoint}:`, e.message);
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err) {
  if (!err) return 'unknown';
  if (typeof err === 'string') return err;
  return err.message || String(err);
}

async function handleJoinFailure(channelName, err) {
  const msg = errorMessage(err).toLowerCase();
  if (!msg.includes('msg_banned')) return;

  console.error(`[Bot] Auto-blacklisting banned channel: ${channelName}`);
  await apiCall('/api/bot/blacklist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: channelName }),
  });
  await apiCall('/api/bot/channels/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: channelName }),
  });
}

async function maybeAnnounceDailyActivation(client, channelName) {
  const channel = String(channelName || '').toLowerCase().replace(/^#/, '');
  if (!channel) return;

  const gate = await apiCall('/api/bot/live-announcement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel })
  });

  if (!gate?.shouldAnnounce) return;

  try {
    await sendChatWithSharedFallback(
      client,
      channel,
      'chat-tag now active in chat. Type @spmt help for all commands.'
    );
    console.log(`[Bot] Sent first-live announcement for ${channel}`);
  } catch (e) {
    console.error(`[Bot] Failed first-live announcement for ${channel}:`, e.message);
  }
}

async function getAppAccessToken() {
  const clientId = env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
  const clientSecret = env.TWITCH_CLIENT_SECRET;
  
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    })
  });
  
  const data = await res.json();
  return data.access_token;
}

let appToken = null;
const roomIdToLoginCache = new Map();
const SOURCE_ONLY_WARNING_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const sourceOnlyWarnedAt = new Map();
let liveMembersCache = {
  fetchedAt: 0,
  members: [],
  map: new Map(),
};

async function sendMessageViaAPI(targetChannel, message, forSourceOnly = false, attempt = 0) {
  console.log(`[Bot] sendMessageViaAPI called: channel=${targetChannel}, forSourceOnly=${forSourceOnly}`);
  if (!appToken) appToken = await getAppAccessToken();
  
  const clientId = env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
  
  // Get broadcaster ID from username
  const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${targetChannel}`, {
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${appToken}`
    }
  });
  const userData = await userRes.json();
  const broadcasterId = userData.data?.[0]?.id;
  
  if (!broadcasterId) {
    console.log(`[Bot] No broadcaster ID found for ${targetChannel}`);
    return { success: false, reason: 'broadcaster-not-found' };
  }
  
  // Get bot user ID
  const botRes = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${appToken}`
    }
  });
  const botData = await botRes.json();
  const senderId = botData.data?.[0]?.id;
  
  if (!senderId) {
    console.log(`[Bot] No sender ID found for ${username}`);
    return { success: false, reason: 'sender-not-found' };
  }
  
  console.log(`[Bot] Sending message to broadcaster ${broadcasterId} from ${senderId}`);
  // Send message
  const res = await fetch('https://api.twitch.tv/helix/chat/messages', {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${appToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      broadcaster_id: broadcasterId,
      sender_id: senderId,
      message: message,
      for_source_only: forSourceOnly
    })
  });
  
  console.log(`[Bot] API response status: ${res.status}`);
  if (res.ok) return { success: true };

  const errorText = await res.text();
  console.log(`[Bot] API error: ${errorText}`);

  if (res.status === 401) {
    const lower = errorText.toLowerCase();
    const isPermissionError =
      lower.includes('channel:bot') ||
      lower.includes('sender must be a moderator') ||
      lower.includes('must have authorized the app');

    if (isPermissionError) {
      console.log('[Bot] Permission 401; not retrying API send.');
      return { success: false, reason: 'permission', status: 401 };
    }

    if (attempt < 1) {
      console.log('[Bot] Token may be expired, refreshing and retrying once...');
      appToken = await getAppAccessToken();
      return sendMessageViaAPI(targetChannel, message, forSourceOnly, attempt + 1);
    }
  }

  return { success: false, reason: 'api-error', status: res.status };
}

async function getLiveMembersCached(force = false) {
  const now = Date.now();
  if (!force && now - liveMembersCache.fetchedAt < 30000 && liveMembersCache.members.length > 0) {
    return liveMembersCache.members;
  }

  const liveData = await apiCall('/api/discord/live-members');
  const members = Array.isArray(liveData?.liveMembers) ? liveData.liveMembers : [];
  const map = new Map();

  for (const member of members) {
    const login = (member?.twitchUsername || '').toLowerCase();
    if (!login) continue;
    map.set(login, member);
  }

  liveMembersCache = {
    fetchedAt: now,
    members,
    map,
  };

  return members;
}

async function sendChatWithSharedFallback(client, targetChannel, message, options = {}) {
  const normalized = String(targetChannel || '').toLowerCase().replace(/^#/, '');
  if (!normalized) return;

  await getLiveMembersCached();
  const member = liveMembersCache.map.get(normalized);
  const inSharedChat = Boolean(member?.isSharedChat);

  if (inSharedChat) {
    const sendResult = await sendMessageViaAPI(normalized, message, true);
    if (sendResult?.success) return;

    await client.say(`#${normalized}`, message);

    if (options.warnOnFallback && sendResult?.reason === 'permission') {
      const lastWarn = sourceOnlyWarnedAt.get(normalized) || 0;
      if (Date.now() - lastWarn > SOURCE_ONLY_WARNING_COOLDOWN_MS) {
        sourceOnlyWarnedAt.set(normalized, Date.now());
        await client.say(
          `#${normalized}`,
          'Shared chat tip: ask the streamer to /mod spacemountainlive to reduce mirrored bot messages.'
        );
      }
    }
    return;
  }

  await client.say(`#${normalized}`, message);
}

async function resolveChannelFromRoomId(roomId, fallbackChannel) {
  const key = String(roomId || '').trim();
  if (!key) return fallbackChannel;
  if (roomIdToLoginCache.has(key)) return roomIdToLoginCache.get(key);

  try {
    if (!appToken) appToken = await getAppAccessToken();
    const clientId = env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
    const res = await fetch(`https://api.twitch.tv/helix/users?id=${encodeURIComponent(key)}`, {
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${appToken}`,
      },
    });
    if (!res.ok) return fallbackChannel;
    const data = await res.json();
    const login = data?.data?.[0]?.login?.toLowerCase();
    if (!login) return fallbackChannel;
    roomIdToLoginCache.set(key, login);
    return login;
  } catch {
    return fallbackChannel;
  }
}

async function broadcastToPlayers(client, message, excludeChannel = null) {
  console.log(`[Bot] broadcastToPlayers called: excludeChannel=${excludeChannel}`);
  try {
    // Get players in the game
    const playersData = await apiCall('/api/tag');
    if (!playersData?.players) {
      console.log('[Bot] No players data');
      return;
    }
    
    // Get live members
    const liveMembers = await getLiveMembersCached(true);
    if (!liveMembers?.length) {
      console.log('[Bot] No live members data');
      return;
    }
    
    // Filter to only players who are in the game AND live, dedup shared sessions.
    const blacklistData = await apiCall('/api/bot/blacklist');
    const blacklistedChannels = new Set((blacklistData?.blacklisted || []).map((c) => c.toLowerCase()));
    const playerSet = new Set(
      playersData.players.map((p) => p.twitchUsername?.toLowerCase()).filter(Boolean)
    );
    const excludeLower = excludeChannel?.toLowerCase();
    const eligibleLive = liveMembers.filter((member) => {
      const login = (member?.twitchUsername || '').toLowerCase();
      return login && login !== excludeLower && playerSet.has(login) && !blacklistedChannels.has(login);
    });

    const groups = new Map();
    for (const member of eligibleLive) {
      const login = (member.twitchUsername || '').toLowerCase();
      if (!login) continue;
      const key = member.sharedSessionId ? `session:${member.sharedSessionId}` : `solo:${login}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(member);
    }

    const channels = [];
    for (const members of groups.values()) {
      if (members.length === 1 && !members[0].sharedSessionId) {
        channels.push((members[0].twitchUsername || '').toLowerCase());
        continue;
      }
      const host = members.find((m) => m.isSharedHost);
      if (host?.twitchUsername) {
        channels.push(host.twitchUsername.toLowerCase());
      } else {
        const fallback = members
          .map((m) => (m.twitchUsername || '').toLowerCase())
          .filter(Boolean)
          .sort()[0];
        if (fallback) channels.push(fallback);
      }
    }
    
    console.log(`[Bot] Broadcasting to ${channels.length} live players`);
    
    for (const ch of channels) {
      try {
        await sendChatWithSharedFallback(client, ch, message, { warnOnFallback: true });
        await new Promise(r => setTimeout(r, 1500)); // 1.5s delay
      } catch (e) {
        console.error(`[Bot] Error broadcasting to ${ch}:`, e.message);
      }
    }
    console.log('[Bot] Broadcast complete');
  } catch (e) {
    console.error('[Bot] Broadcast error:', e.message);
  }
}

const username = env.TWITCH_BOT_USERNAME;
const recentMessages = new Set();
const BOT_TEST_CHANNEL = (env.BOT_TEST_CHANNEL || '').toLowerCase().replace(/^#/, '');
const ALWAYS_JOINED_CHANNELS = ['mtman1987']; // Always stay in these channels
let isIrcConnected = false;
let lastPeriodicSuccessAt = Date.now();
const logBuffer = [];
const MAX_LOG_LINES = 100;

// Override console.log to capture logs
const originalLog = console.log;
console.log = (...args) => {
  const line = args.join(' ');
  logBuffer.push(`${new Date().toISOString()} ${line}`);
  if (logBuffer.length > MAX_LOG_LINES) logBuffer.shift();
  originalLog(...args);
};

(async () => {
  const token = await getValidToken();
  console.log('[Bot] Username:', username);
  console.log('[Bot] Token:', token.substring(0, 10) + '...');

  const client = new tmi.Client({
    options: { debug: false },
    connection: {
      reconnect: true,
      reconnectInterval: 5_000,
      maxReconnectInterval: 30_000,
      reconnectDecay: 1.5,
      secure: true
    },
    identity: { username, password: `oauth:${token}` },
    channels: [username]
  });

  client.on('disconnected', (reason) => {
    console.log(`[Bot] Disconnected: ${reason}`);
    isIrcConnected = false;
  });

  client.on('reconnect', () => {
    console.log('[Bot] Reconnecting...');
  });

  client.on('connected', () => {
    isIrcConnected = true;
  });

  // Catch unhandled errors to prevent crashes
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Bot] Unhandled Rejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[Bot] Uncaught Exception:', err);
    setTimeout(() => process.exit(1), 500);
  });

  client.on('connected', async () => {
    console.log('[Bot] ✅ Connected');

    if (BOT_TEST_CHANNEL) {
      try {
        await client.join(BOT_TEST_CHANNEL);
        console.log(`[Bot] Joined #${BOT_TEST_CHANNEL} for testing`);
      } catch (e) {
        console.error(`[Bot] Failed joining test channel #${BOT_TEST_CHANNEL}:`, e.message);
      }
    }

    // Always join mtman1987's channel for testing
    for (const ch of ALWAYS_JOINED_CHANNELS) {
      try {
        await client.join(`#${ch}`);
        console.log(`[Bot] Joined #${ch} (always-on channel)`);
      } catch (e) {
        console.error(`[Bot] Failed joining always-on channel #${ch}:`, e.message);
      }
    }
    
    // Auto-join only live channels with retry
    let channels = null;
    for (let i = 0; i < 3; i++) {
      channels = await apiCall('/api/bot/channels');
      if (channels?.channels) break;
      await new Promise(r => setTimeout(r, 2000));
    }
    
    if (channels?.channels) {
      // Extract channel names from objects
      const allChannelNames = channels.channels.map(c => typeof c === 'string' ? c : c.name);
      
      // Get live channels
      const liveData = await apiCall('/api/discord/live-members');
      const liveMembers = (liveData?.liveMembers || []).filter((m) =>
        allChannelNames.includes((m.twitchUsername || '').toLowerCase())
      );
      // Add always-joined channels to live list for testing
      const alwaysJoinedMembers = ALWAYS_JOINED_CHANNELS.map(ch => ({ twitchUsername: ch }));
      const allLiveMembers = [...liveMembers, ...alwaysJoinedMembers];
      const groups = new Map();
      for (const member of allLiveMembers) {
        const login = (member.twitchUsername || '').toLowerCase();
        if (!login) continue;
        const key = member.sharedSessionId ? `session:${member.sharedSessionId}` : `solo:${login}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(member);
      }
      const allLiveChannels = [];
      for (const members of groups.values()) {
        if (members.length === 1 && !members[0].sharedSessionId) {
          allLiveChannels.push((members[0].twitchUsername || '').toLowerCase());
          continue;
        }
        const host = members.find((m) => m.isSharedHost);
        if (host?.twitchUsername) {
          allLiveChannels.push(host.twitchUsername.toLowerCase());
        } else {
          const fallback = members
            .map((m) => (m.twitchUsername || '').toLowerCase())
            .filter(Boolean)
            .sort()[0];
          if (fallback) allLiveChannels.push(fallback);
        }
      }
      
      console.log(`[Bot] Found ${allLiveChannels.length} live channels out of ${allChannelNames.length} total`);
      
      const joinedChannels = [];
      const alreadyJoined = new Set(client.getChannels().map((ch) => ch.replace('#', '').toLowerCase()));

      // Join channels one at a time with delay
      for (const ch of Array.from(new Set(allLiveChannels))) {
        if (alreadyJoined.has(ch)) continue;
        try {
          await client.join(`#${ch}`);
          joinedChannels.push(ch);
          await maybeAnnounceDailyActivation(client, ch);
          // Random delay 2-3s between joins (same logic as broadcasts)
          await sleep(2000 + Math.random() * 1000);
        } catch (e) {
          console.error(`[Bot] Startup join failed ${ch}: ${errorMessage(e)}`);
          await handleJoinFailure(ch, e);
        }
      }
      console.log(`[Bot] Joined ${joinedChannels.length} channels`);
      
      // Save actually joined channels
      const actualJoined = client.getChannels().map((ch) => ch.replace('#', '').toLowerCase());
      await apiCall('/api/bot/auto-join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: actualJoined })
      });
    } else {
      console.log('[Bot] ⚠️ Could not fetch channels, will only listen to own channel');
    }
  });

  // Auto-rotate check and channel management
  setInterval(async () => {
    try {
      console.log('[Bot] Running periodic check...');
      // Auto-rotate check
      const data = await apiCall('/api/tag');
      if (data?.currentIt && data?.lastTagTime) {
        const elapsed = Date.now() - data.lastTagTime;
        console.log(`[Bot] Current it: ${data.currentIt}, elapsed: ${Math.floor(elapsed / 60000)} minutes`);
        if (elapsed > AUTO_ROTATE_MINUTES * 60 * 1000) {
          const isStaleTimeout = elapsed > STALE_LAST_TAG_HOURS * 60 * 60 * 1000;
          console.log(`[Bot] Triggering auto-rotate! stale=${isStaleTimeout}`);
          await apiCall('/api/tag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'auto-rotate' })
          });

          // Prevent spam after redeploy/restart with very old state.
          if (!isStaleTimeout) {
            console.log('[Bot] Broadcasting free-for-all message...');
            await broadcastToPlayers(client, '⏰ Auto-rotate: FREE FOR ALL! Anyone can tag for DOUBLE POINTS! 🔥');
            console.log('[Bot] Auto-rotate complete');
          } else {
            console.log('[Bot] Stale timeout detected; skipped global broadcast.');
          }
        }
      } else {
        console.log('[Bot] No current it or lastTagTime');
      }

      // Channel management - join new live, leave offline
      const channels = await apiCall('/api/bot/channels');
      if (channels?.channels) {
        const allChannelNames = channels.channels.map(c => typeof c === 'string' ? c : c.name);
        const liveData = await apiCall('/api/discord/live-members');
        const liveMembers = (liveData?.liveMembers || []).filter((m) =>
          allChannelNames.includes((m.twitchUsername || '').toLowerCase())
        );
        // Add always-joined channels to live list
        const alwaysJoinedMembers = ALWAYS_JOINED_CHANNELS.map(ch => ({ twitchUsername: ch }));
        const allLiveMembers = [...liveMembers, ...alwaysJoinedMembers];
        const groups = new Map();
        for (const member of allLiveMembers) {
          const login = (member.twitchUsername || '').toLowerCase();
          if (!login) continue;
          const key = member.sharedSessionId ? `session:${member.sharedSessionId}` : `solo:${login}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(member);
        }
        const currentlyLive = [];
        for (const members of groups.values()) {
          if (members.length === 1 && !members[0].sharedSessionId) {
            currentlyLive.push((members[0].twitchUsername || '').toLowerCase());
            continue;
          }
          const host = members.find((m) => m.isSharedHost);
          if (host?.twitchUsername) {
            currentlyLive.push(host.twitchUsername.toLowerCase());
          } else {
            const fallback = members
              .map((m) => (m.twitchUsername || '').toLowerCase())
              .filter(Boolean)
              .sort()[0];
            if (fallback) currentlyLive.push(fallback);
          }
        }

        console.log(`[Bot] Periodic check: ${currentlyLive.length} live channels`);

        // Get currently joined channels from TMI client
        const currentlyJoined = client.getChannels().map(ch => ch.replace('#', '').toLowerCase());

        // Join new live channels
        const toJoin = Array.from(new Set(currentlyLive.filter(ch => !currentlyJoined.includes(ch))));
        for (const ch of toJoin) {
          try {
            await client.join(`#${ch}`);
            console.log(`[Bot] Joined new live channel: ${ch}`);
            await maybeAnnounceDailyActivation(client, ch);
            await sleep(1200 + Math.random() * 500);
          } catch (e) {
            console.error(`[Bot] Failed joining ${ch}: ${errorMessage(e)}`);
            await handleJoinFailure(ch, e);
          }
        }

        // Leave offline channels
        const toLeave = currentlyJoined.filter(
          ch => !currentlyLive.includes(ch) && ch !== username && ch !== BOT_TEST_CHANNEL && !ALWAYS_JOINED_CHANNELS.includes(ch)
        );
        for (const ch of toLeave) {
          try {
            await client.part(`#${ch}`);
            console.log(`[Bot] Left offline channel: ${ch}`);
          } catch (e) {
            console.error(`[Bot] Failed leaving ${ch}: ${errorMessage(e)}`);
          }
        }

        // Persist actual joined list every cycle to avoid stale UI state drift.
        const actualJoined = client.getChannels().map((ch) => ch.replace('#', '').toLowerCase());
        await apiCall('/api/bot/auto-join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channels: actualJoined })
        });
      }

      lastPeriodicSuccessAt = Date.now();
    } catch (e) {
      console.error('[Bot] Periodic loop failed:', e.message);
    }
  }, 240000);

  // Watchdog: if IRC drops and tmi reconnect stalls, hard-exit so Fly restarts the machine.
  setInterval(async () => {
    try {
      const readyState = client.readyState ? client.readyState() : 'unknown';
      if (!isIrcConnected && readyState === 'CLOSED') {
        console.error('[Bot] IRC appears closed; exiting for clean restart.');
        process.exit(1);
      }

      if (Date.now() - lastPeriodicSuccessAt > 15 * 60 * 1000) {
        console.error('[Bot] Periodic loop stalled; exiting for clean restart.');
        process.exit(1);
      }
    } catch (e) {
      console.error('[Bot] Watchdog error:', e.message);
    }
  }, 60000);

  client.on('message', async (channel, tags, message, self) => {
    if (self) return;
    
    const msg = message.toLowerCase().trim();
    if (!msg.startsWith('@spmt ')) return;
    
    // In shared chat, process mirrored partner messages too, but map to source channel context.
    const rawChannelName = channel.replace('#', '');
    const roomId = tags['room-id'];
    const sourceRoomId = tags['source-room-id'] || tags['source-id'];
    const isMirroredSharedMessage = Boolean(roomId && sourceRoomId && roomId !== sourceRoomId);
    const channelName = isMirroredSharedMessage
      ? await resolveChannelFromRoomId(sourceRoomId, rawChannelName)
      : rawChannelName;
    const reply = async (text) =>
      sendChatWithSharedFallback(client, channelName, text, { warnOnFallback: true });

    // Extra short dedup window by message id.
    const msgId = tags.id;
    if (recentMessages.has(msgId)) return;
    recentMessages.add(msgId);
    setTimeout(() => recentMessages.delete(msgId), 5000);
    
    // Small random delay to avoid looking too bot-like (0.5-1.5s)
    await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
    
    const args = msg.split(/\s+/).slice(1);
    const cmd = args[0];
    const userId = `user_${tags['user-id']}`;
    const user = tags['display-name'] || tags['username'];
    const isAdminUser =
      user?.toLowerCase() === 'mtman1987' ||
      Boolean(tags?.mod) ||
      tags?.badges?.broadcaster === '1';
    
    // Blacklist check
    if (BLACKLIST.includes(user.toLowerCase())) return;

    const blacklistData = await apiCall('/api/bot/blacklist');
    const channelIsBlacklisted = blacklistData?.blacklisted?.includes(channelName);
    if (channelIsBlacklisted) {
      return;
    }
    
    // Muted channel check - still process commands but don't respond
    const mutedData = await apiCall('/api/bot/muted');
    const isMuted = mutedData?.muted?.includes(channelName);
    
    if (isMirroredSharedMessage) {
      console.log(`[Bot] Shared chat mirrored command mapped ${rawChannelName} -> ${channelName}`);
    }
    console.log(`[Bot] ${user}: @spmt ${cmd}`);
    
    if (cmd === 'join') {
      console.log(`[Bot] Join command from ${user}`);
      const targetUser = args[1]?.replace('@', '');
      
      if (targetUser) {
        console.log(`[Bot] Admin adding ${targetUser}`);
        // Admin adding someone else
        const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${targetUser.toLowerCase()}`, {
          headers: {
            'Client-ID': env.NEXT_PUBLIC_TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${token}`
          }
        });
        const userData = await userRes.json();
        
        if (!userData.data?.[0]) {
          console.log(`[Bot] User ${targetUser} not found`);
          reply( `@${user} User ${targetUser} not found!`);
          return;
        }
        
        const targetId = `user_${userData.data[0].id}`;
        const targetName = userData.data[0].display_name;
        
        const res = await apiCall('/api/tag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'join', userId: targetId, twitchUsername: targetName, avatar: '' })
        });
        console.log(`[Bot] Join result: ${JSON.stringify(res)}`);
        reply( res?.error ? `@${user} ${res.error}` : `@${targetName} joined the tag game! 🎯`);
      } else {
        console.log(`[Bot] ${user} joining themselves`);
        // User joining themselves - get their avatar from Twitch
        const userRes = await fetch(`https://api.twitch.tv/helix/users?id=${tags['user-id']}`, {
          headers: {
            'Client-ID': env.NEXT_PUBLIC_TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${token}`
          }
        });
        const userData = await userRes.json();
        const avatarUrl = userData.data?.[0]?.profile_image_url || '';
        console.log(`[Bot] Got avatar: ${avatarUrl}`);
        
        const res = await apiCall('/api/tag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'join', userId, twitchUsername: user, avatar: avatarUrl })
        });
        console.log(`[Bot] Join result: ${JSON.stringify(res)}`);
        try {
          await reply( res?.error ? `@${user} ${res.error}` : `@${user} joined the tag game! 🎯`);
          console.log('[Bot] Join message sent');
        } catch (e) {
          console.error('[Bot] Error sending message:', e.message);
        }
      }
    }
    
    else if (cmd === 'leave') {
      console.log(`[Bot] Leave command from ${user}`);
      await apiCall('/api/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'leave', userId })
      });
      await reply( `@${user} left the tag game!`);
      console.log('[Bot] Leave message sent');
    }

    else if (cmd === 'optout') {
      await apiCall('/api/bot/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelName })
      });
      await apiCall('/api/bot/channels/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelName })
      });
      try {
        await reply( `@${user} You are now opted out. Bot will not join or speak in this channel.`);
        await client.part(channelName);
      } catch {}
      return;
    }
    
    else if (cmd === 'tag') {
      const target = args[1]?.replace('@', '').toLowerCase();
      console.log(`[Bot] Tag command: target="${target}"`);
      if (!target) {
        reply( `@${user} Usage: "@spmt tag @username"`);
        return;
      }
      
      // Special pinscorpion6521 tag - always works, tracks separately
      if (user.toLowerCase() === 'pinscorpion6521') {
        // Special case for scarlett_ai420 (bot account)
        if (target === 'scarlett_ai420') {
          const pinRes = await apiCall('/api/tag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'pin-tag', userId, targetUserId: 'fake_scarlett', targetUsername: 'scarlett_ai420' })
          });
          reply( `🎯 ${user} tagged @scarlett_ai420! (Pin has tagged them ${pinRes.count} times total)`);
          return;
        }
        
        const playersData = await apiCall('/api/tag');
        const targetPlayer = playersData?.players?.find(p => (p.twitchUsername || p.username)?.toLowerCase() === target);
        
        if (!targetPlayer) {
          reply( `@${user} ${target} is not in the game!`);
          return;
        }
        
        // Track pin's personal count
        const pinRes = await apiCall('/api/tag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'pin-tag', userId, targetUserId: targetPlayer.id, targetUsername: target })
        });
        
        // Check if pin is "it" OR if it's FREE FOR ALL mode
        const pinPlayer = playersData?.players?.find(p => p.id === userId);
        const anyoneIt = playersData?.players?.some(p => p.isIt);
        
        if (pinPlayer?.isIt || !anyoneIt) {
          const realTagRes = await apiCall('/api/tag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'tag', userId, targetUserId: targetPlayer.id, streamerId: channelName })
          });
          
          if (realTagRes?.error) {
            reply( `@${user} ${realTagRes.error}`);
          } else {
            const msg = realTagRes.doublePoints
              ? `🔥 ${user} tagged @${target} for DOUBLE POINTS! @${target} is now it! (Pin has tagged them ${pinRes.count} times total)`
              : `🎯 ${user} tagged @${target}! @${target} is now it! (Pin has tagged them ${pinRes.count} times total)`;
            await sendChatWithSharedFallback(client, channelName, msg, { warnOnFallback: true });
            if (!isMuted) {
              await broadcastToPlayers(client, msg, channelName);
            }
          }
        } else {
          // Just pin tag, no real tag
            reply( `🎯 ${user} tagged @${target}! (Pin has tagged them ${pinRes.count} times total)`);
        }
        return;
      }
      
      // Look up target's actual user ID from players
      const playersData = await apiCall('/api/tag');
      console.log(`[Bot] Got ${playersData?.players?.length || 0} players`);
      const targetPlayer = playersData?.players?.find(p => (p.twitchUsername || p.username)?.toLowerCase() === target);
      console.log(`[Bot] Target player found: ${!!targetPlayer}`);
      
      if (!targetPlayer) {
        console.log(`[Bot] ${target} not in game`);
        reply( `@${user} ${target} is not in the game!`);
        return;
      }
      
      console.log(`[Bot] Calling tag API...`);
      const res = await apiCall('/api/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tag', userId, targetUserId: targetPlayer.id, streamerId: channelName })
      });
      console.log(`[Bot] Tag API response: ${JSON.stringify(res)}`);
      
      if (res?.error) {
        console.log(`[Bot] Tag error: ${res.error}`);
        reply( `@${user} ${res.error}`);
        return;
      } else {
        const msg = res.doublePoints 
          ? `🔥 ${user} tagged @${target} for DOUBLE POINTS! @${target} is now it! 🔥`
          : `🎯 ${user} tagged @${target}! @${target} is now it!`;
        console.log(`[Bot] Sending tag message in current channel`);
        await reply( msg);
        if (!isMuted) {
          console.log('[Bot] Broadcasting to other players...');
          await broadcastToPlayers(client, msg, channelName);
        }
        
        // Discord announcement
        console.log('[Bot] Sending Discord announcement...');
        await apiCall('/api/discord/announce', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagger: user, tagged: target, doublePoints: res.doublePoints })
        });
        console.log('[Bot] Tag complete');
      }
    }
    
    else if (cmd === 'sleep') {
      const target = args[1]?.replace('@', '').toLowerCase();
      let targetId = userId;
      let targetName = user;

      if (target) {
        if (!isAdminUser) {
          await reply( `@${user} Only mods/admins can set someone else to sleep.`);
          return;
        }
        const data = await apiCall('/api/tag');
        const targetPlayer = data?.players?.find(
          (p) => (p.twitchUsername || p.username || '').toLowerCase() === target
        );
        if (!targetPlayer) {
          await reply( `@${user} ${target} is not in the game.`);
          return;
        }
        targetId = targetPlayer.id;
        targetName = targetPlayer.twitchUsername || targetPlayer.username || target;
      }

      console.log(`[Bot] Sleep command from ${user} targeting ${targetName}`);
      await apiCall('/api/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sleep', userId: targetId })
      });
      await reply( `@${targetName} is now away/sleeping 😴 (immune from tags)`);
      console.log('[Bot] Sleep message sent');
    }
    
    else if (cmd === 'wake') {
      const target = args[1]?.replace('@', '').toLowerCase();
      let targetId = userId;
      let targetName = user;

      if (target) {
        if (!isAdminUser) {
          await reply( `@${user} Only mods/admins can wake someone else.`);
          return;
        }
        const data = await apiCall('/api/tag');
        const targetPlayer = data?.players?.find(
          (p) => (p.twitchUsername || p.username || '').toLowerCase() === target
        );
        if (!targetPlayer) {
          await reply( `@${user} ${target} is not in the game.`);
          return;
        }
        targetId = targetPlayer.id;
        targetName = targetPlayer.twitchUsername || targetPlayer.username || target;
      }

      console.log(`[Bot] Wake command from ${user} targeting ${targetName}`);
      await apiCall('/api/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'wake', userId: targetId })
      });
      await reply( `@${targetName} is now awake! ☀️`);
      console.log('[Bot] Wake message sent');
    }
    
    else if (cmd === 'status' || cmd === 'whosit') {
      console.log('[Bot] Status command');
      const data = await apiCall('/api/tag');
      const itPlayer = data?.players?.find(p => p.isIt);
      const itName = itPlayer ? (itPlayer.twitchUsername || itPlayer.username || 'Someone') : null;
      const response = itName 
        ? `@${user} ${itName} is it!`
        : `@${user} 🔥 FREE FOR ALL! Anyone can tag for DOUBLE POINTS! 🔥`;
      console.log(`[Bot] Sending: ${response}`);
      await reply( response);
      console.log('[Bot] Status sent');
    }
    
    else if (cmd === 'players') {
      const data = await apiCall('/api/tag');
      const players = data?.players || [];
      const awake = players.filter(p => !p.isSleeping && !p.offlineImmunity);
      const asleep = players.filter(p => p.isSleeping || p.offlineImmunity);
      const total = players.length;
      const perPage = 15;
      
      if (!global.playerPages) global.playerPages = {};
      if (!global.playerPages[userId]) global.playerPages[userId] = 0;
      
      const page = global.playerPages[userId];
      const allSorted = [...awake, ...asleep];
      const totalPages = Math.ceil(allSorted.length / perPage);
      const start = page * perPage;
      const end = Math.min(start + perPage, allSorted.length);
      const pageNames = allSorted.slice(start, end).map(p => p.twitchUsername || p.username).join(', ');
      
      const sleepNote = asleep.length > 0 && end > awake.length ? ` (${asleep.length} asleep at end)` : '';
      reply( `@${user} ${total} players (${page + 1}/${totalPages}): ${pageNames}${sleepNote}${page + 1 < totalPages ? ' | Type "@spmt more" for next page' : ''}`);
      
      global.playerPages[userId] = (page + 1) % totalPages;
    }
    
    else if (cmd === 'more') {
      const data = await apiCall('/api/tag');
      const players = data?.players || [];
      const awake = players.filter(p => !p.isSleeping && !p.offlineImmunity);
      const asleep = players.filter(p => p.isSleeping || p.offlineImmunity);
      const total = players.length;
      const perPage = 15;
      
      if (!global.playerPages) global.playerPages = {};
      if (!global.playerPages[userId]) global.playerPages[userId] = 0;
      
      const page = global.playerPages[userId];
      const allSorted = [...awake, ...asleep];
      const totalPages = Math.ceil(allSorted.length / perPage);
      const start = page * perPage;
      const end = Math.min(start + perPage, allSorted.length);
      const pageNames = allSorted.slice(start, end).map(p => p.twitchUsername || p.username).join(', ');
      
      const sleepNote = asleep.length > 0 && end > awake.length ? ` (${asleep.length} asleep at end)` : '';
      reply( `@${user} ${total} players (${page + 1}/${totalPages}): ${pageNames}${sleepNote}${page + 1 < totalPages ? ' | Type "@spmt more" for next page' : ''}`);
      
      global.playerPages[userId] = (page + 1) % totalPages;
    }

    else if (cmd === 'admin' || cmd === 'mod') {
      console.log(`[Bot] Admin command from ${user}, isAdmin: ${isAdminUser}`);
      if (!isAdminUser) {
        console.log('[Bot] User is not admin, showing no additional commands');
        await reply( `@${user} No additional commands.`);
        return;
      }
      console.log('[Bot] Sending admin command list');
      await reply(
        `@${user} Mod/Admin: "@spmt support" = Open help ticket | "@spmt sleep @user" = Set away | "@spmt wake @user" = Clear away | "@spmt leave" = Leave game | "@spmt mute" = Mute bot | "@spmt unmute" = Unmute bot | "@spmt card" = Bingo card | "@spmt claim [0-24]" = Claim bingo square`
      );
      console.log('[Bot] Admin command complete');
    }

    else if (cmd === 'support' || cmd === 'ticket') {
      console.log(`[Bot] Support command from ${user}`);
      const note = args.slice(1).join(' ').trim();
      console.log(`[Bot] Calling help-ticket API with note: "${note}"`);
      const ticketRes = await apiCall('/api/discord/help-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requester: user,
          requesterId: userId,
          channel: channelName,
          note: note || null,
        })
      });
      console.log(`[Bot] Help-ticket API response:`, JSON.stringify(ticketRes));

      if (ticketRes?.error) {
        console.log(`[Bot] Help-ticket error: ${ticketRes.error}`);
        await reply( `@${user} Could not open support ticket right now.`);
        return;
      }

      console.log('[Bot] Sending success message');
      await reply( `@${user} Support ticket sent to admin.`);
      console.log('[Bot] Support command complete');
    }
    
    else if (cmd === 'live') {
      const liveData = await apiCall('/api/discord/live-members');
      const playersData = await apiCall('/api/tag');
      const playerIds = new Set(playersData?.players?.map(p => (p.twitchUsername || p.username)?.toLowerCase()) || []);
      const liveMembers = (liveData?.liveMembers || []).filter(m => playerIds.has(m.twitchUsername?.toLowerCase()));
      
      if (liveMembers.length === 0) {
        reply( `@${user} No players are live right now!`);
        return;
      }
      
      const total = liveMembers.length;
      const perPage = 15;
      const totalPages = Math.ceil(total / perPage);
      
      if (!global.livePages) global.livePages = {};
      if (!global.livePages[userId]) global.livePages[userId] = 0;
      
      const page = global.livePages[userId];
      const start = page * perPage;
      const end = Math.min(start + perPage, total);
      const pageNames = liveMembers.slice(start, end).map(m => m.twitchUsername).join(', ');
      
      reply( `@${user} Live now (${page + 1}/${totalPages}): ${pageNames}${page + 1 < totalPages ? ' | Type "@spmt more" for next page' : ''}`);
      
      global.livePages[userId] = (page + 1) % totalPages;
    }
    
    else if (cmd === 'score') {
      const data = await apiCall('/api/tag');
      const player = data?.players?.find(p => p.id === userId);
      if (!player) {
        reply( `@${user} You're not in the game! Use "@spmt join"`);
        return;
      }
      const sorted = (data?.players || []).sort((a, b) => (b.score || 0) - (a.score || 0));
      const rank = sorted.findIndex(p => p.id === userId) + 1;
      reply( `@${user} Rank: #${rank}/${sorted.length} | Score: ${player.score || 0} pts | Tags: ${player.tags || 0} | Tagged: ${player.tagged || 0}`);
    }
    
    else if (cmd === 'rank') {
      const data = await apiCall('/api/tag');
      const sorted = (data?.players || []).filter(p => (p.twitchUsername || p.username)?.toLowerCase() !== 'mtman1987').sort((a, b) => (b.score || 0) - (a.score || 0));
      const top3 = sorted.slice(0, 3);
      const rankings = top3.map((p, i) => `#${i+1} ${p.twitchUsername || p.username}: ${p.score || 0}`).join(' | ');
      reply( `@${user} Top 3: ${rankings}`);
    }
    
    else if (cmd === 'pinrank') {
      const pinData = await apiCall('/api/tag/pin-stats');
      if (!pinData?.topTagged || pinData.topTagged.length === 0) {
        reply( `@${user} Pin hasn't tagged anyone yet!`);
        return;
      }
      const top5 = pinData.topTagged.slice(0, 5).map((entry, i) => `#${i+1} ${entry.username}: ${entry.count}`).join(' | ');
      reply( `@${user} Pin's Top 5: ${top5}`);
    }
    
    else if (cmd === 'stats') {
      const data = await apiCall('/api/tag');
      const player = data?.players?.find(p => p.id === userId);
      reply( player 
        ? `@${user} Tags Made: ${player.tags || 0} | Times Tagged: ${player.tagged || 0}`
        : `@${user} You're not in the game! Use "@spmt join"`);
    }
    
    else if (cmd === 'rules') {
      reply( `@${user} Tag Rules: Tag someone by typing "@spmt tag @username" in their chat. If you're it, tag someone else! Use "@spmt sleep" to go immune. Type "@spmt help" for all commands.`);
    }
    
    else if (cmd === 'info') {
      reply( `@${user} Chat Tag game by SPMT! Join with @spmt join`);
    }
    
    else if (cmd === 'mute') {
      await apiCall('/api/bot/muted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelName })
      });
      reply( `@${user} Bot muted in this channel.`);
    }
    
    else if (cmd === 'unmute') {
      await apiCall('/api/bot/unmute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelName })
      });
      reply( `@${user} Bot unmuted in this channel.`);
    }
    
    else if (cmd === 'card') {
      const data = await apiCall('/api/bingo/state');
      const card = data?.bingo;
      
      if (!card?.phrases) {
        reply( `@${user} No bingo card found!`);
        return;
      }
      
      // Build compact single-line format
      const rows = [];
      for (let row = 0; row < 5; row++) {
        const cells = [];
        for (let col = 0; col < 5; col++) {
          const idx = row * 5 + col;
          cells.push(card.covered[idx] ? 'X' : idx.toString());
        }
        rows.push('[' + cells.join('|') + ']');
      }
      
      reply( `@${user} Bingo Card: ${rows.join(' ')} | Use "@spmt claim [0-24]" to mark. X=claimed`);
    }
    
    else if (cmd === 'claim') {
      const squareNum = parseInt(args[1]);
      if (isNaN(squareNum) || squareNum < 0 || squareNum > 24) {
        reply( `@${user} Usage: @spmt claim [0-24]`);
        return;
      }
      
      const res = await apiCall('/api/bingo/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'claim', 
          squareIndex: squareNum,
          userId,
          username: user,
          avatar: '',
          streamerChannel: channelName
        })
      });
      
      reply( res?.success 
        ? `@${user} Claimed square ${squareNum}! ${res.bingo ? '🎉 BINGO! +100 points!' : ''}`
        : `@${user} ${res?.error || 'Error claiming square'}`);
    }
    
    else if (cmd === 'help') {
      console.log(`[Bot] Attempting to send help to ${channel}`);
      try {
        await reply( `@${user} "@spmt join" = Join game | "@spmt tag @user" = Tag someone | "@spmt status" = Who's it | "@spmt score" = Your stats | "@spmt rank" = Your rank | "@spmt players" = Player count | "@spmt live" = Live streamers | "@spmt sleep" = Go immune | "@spmt wake" = Remove immunity | "@spmt rules" = Rules | Mods: "@spmt mod"`);
        console.log(`[Bot] Help message sent successfully`);
      } catch (e) {
        console.error('[Bot] Error sending help:', e.message);
      }
    }
  });

  // HTTP server for broadcast and refresh requests
  const http = require('http');
  const httpServer = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      const payload = {
        ok: true,
        botUser: username,
        connected: isIrcConnected,
        joinedChannels: client.getChannels().length,
        uptimeSec: Math.floor(process.uptime())
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
      return;
    }

    if (req.method === 'POST' && req.url === '/broadcast') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { message, channel } = JSON.parse(body);
          if (channel) {
            await sendChatWithSharedFallback(client, channel, message, { warnOnFallback: true });
          } else {
            await broadcastToPlayers(client, message);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    } else if (req.method === 'POST' && req.url === '/broadcast-source') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { message, channel } = JSON.parse(body);
          if (!channel) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'channel is required' }));
            return;
          }
          const result = await sendMessageViaAPI(channel, message, true);
          if (result?.success) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          const status = result?.reason === 'permission' ? 403 : 500;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, reason: result?.reason || 'send-failed' }));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    } else if (req.method === 'POST' && req.url === '/refresh') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { channel } = JSON.parse(body);
          await client.join(channel);
          console.log(`[Bot] Instant join: ${channel}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    } else if (req.method === 'POST' && req.url === '/write-logs') {
      (async () => {
        try {
          const logs = logBuffer.join('\n');
          const response = await fetch(`${API_BASE}/api/bot/write-logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ logs })
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, lines: logBuffer.length }));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        }
      })();
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  httpServer.listen(8091, () => console.log('[HTTP] Broadcast server on :8091'));

  client.connect().catch(async err => {
    console.error('[Bot] Connection error:', err);
    if (err.message?.includes('authentication')) {
      console.log('[Bot] Auth failed, refreshing token and retrying...');
      try {
        const newToken = await getValidToken();
        client.opts.identity.password = `oauth:${newToken}`;
        await client.connect();
      } catch (e) {
        console.error('[Bot] Retry failed:', e);
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  });
})();

