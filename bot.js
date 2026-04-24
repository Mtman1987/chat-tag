const tmi = require('tmi.js');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// Load environment variables
const env = process.env;

const API_BASE = process.env.API_BASE || 'https://chat-tag-new.fly.dev';
const BLACKLIST = ['streamelements', 'nightbot', 'moobot', 'fossabot'];
const DSH_API_BASE = process.env.DSH_API_BASE || 'https://discord-stream-hub-new.fly.dev';
const AUTO_ROTATE_MINUTES = 40;
const STALE_LAST_TAG_HOURS = 6;
const FORCE_RANDOM_IT_HOURS = 5;
const FFA_REANNOUNCE_MINUTES = 60;
let lastFfaAnnouncedAt = 0;

// ── EventSub state ──
let eventSubSocket = null;
let eventSubSessionId = null;
let eventSubReconnectTimer = null;
const eventSubSubscriptions = new Set(); // track active sub types per broadcaster
const broadcasterIdCache = new Map(); // login -> { id, login }

function getTwitchClientId() {
  return env.NEXT_PUBLIC_TWITCH_CLIENT_ID || env.TWITCH_CLIENT_ID || env.TWITCH_DEV_CLIENT_ID;
}

function getTwitchClientSecret() {
  return env.TWITCH_CLIENT_SECRET || env.TWITCH_DEV_CLIENT_SECRET;
}

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
  // Critical Fix: Both update in-memory AND persist to .env file
  process.env[key] = value;
  
  // Try to persist to .env file if it exists
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      // Read current .env content
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      // Replace the key=value line or add new line if not exists
      const keyPattern = new RegExp(`^${key}=.*$`, 'm');
      if (keyPattern.test(envContent)) {
        envContent = envContent.replace(keyPattern, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
      
      // Write back to file (with atomic write for safety)
      const tempPath = envPath + '.tmp';
      fs.writeFileSync(tempPath, envContent, 'utf8');
      fs.renameSync(tempPath, envPath);
      
      console.log(`[Bot] Token refresh: ${key} persisted to .env file and updated in memory`);
    } else {
      console.warn(`[Bot] .env file not found at ${envPath} - token updated in memory only (will be lost on restart)`);
    }
  } catch (error) {
    console.error(`[Bot] Failed to persist token to .env:`, error.message);
    console.warn(`[Bot] Token updated in memory only - bot will lose token on restart!`);
  }
}

async function getValidToken() {
  const clientId = getTwitchClientId();
  const clientSecret = getTwitchClientSecret();
  const token = env.TWITCH_BOT_TOKEN;
  const refreshTokenValue = env.TWITCH_BOT_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !token || !refreshTokenValue) {
    throw new Error('Missing Twitch bot credentials');
  }
  
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

// Forward Twitch events to DSH for leaderboard points (fire and forget)
function forwardToDSH(eventData) {
  fetch(`${DSH_API_BASE}/api/twitch/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eventData),
  }).then(r => {
    if (!r.ok) console.log(`[DSH] Forward failed: ${r.status}`);
  }).catch(e => console.error('[DSH] Forward error:', e.message));
}

function dedupeSharedChatChannels(members) {
  const groups = new Map();
  for (const member of members) {
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
  return channels;
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
      '🏷️ Chat Tag by MtMan1987 is active! Type "@spmt join" to play, "@spmt help" for commands.'
    );
    console.log(`[Bot] Sent first-live announcement for ${channel}`);
  } catch (e) {
    console.error(`[Bot] Failed first-live announcement for ${channel}:`, e.message);
  }
}

async function getAppAccessToken() {
  const clientId = getTwitchClientId();
  const clientSecret = getTwitchClientSecret();

  if (!clientId || !clientSecret) {
    throw new Error('Missing Twitch app credentials');
  }
  
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
const broadcasterTokenCache = { token: null, expiresAt: 0 };
const SOURCE_ONLY_WARNING_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const sourceOnlyWarnedAt = new Map();
let liveMembersCache = {
  fetchedAt: 0,
  members: [],
  map: new Map(),
};

async function sendMessageViaAPI(targetChannel, message, forSourceOnly = false, attempt = 0) {
  console.log(`[Bot] sendMessageViaAPI called: channel=${targetChannel}, forSourceOnly=${forSourceOnly}`);
  const clientId = getTwitchClientId();
  
  // Get app access token — required for for_source_only support
  if (!appToken) appToken = await getAppAccessToken();
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
  // Use app access token for for_source_only support; fall back to bot user token
  const tokenToUse = forSourceOnly ? appToken : (env.TWITCH_BOT_TOKEN || appToken);
  const body = {
    broadcaster_id: broadcasterId,
    sender_id: senderId,
    message: message
  };
  if (forSourceOnly) body.for_source_only = true;
  const res = await fetch('https://api.twitch.tv/helix/chat/messages', {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${tokenToUse}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
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
      try {
        if (forSourceOnly) {
          appToken = await getAppAccessToken();
        } else {
          await getValidToken();
        }
      } catch (e) {
        console.error('[Bot] Token refresh failed:', e.message);
      }
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
  if (!normalized || !message) return;

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
    const clientId = getTwitchClientId();
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

    const channels = dedupeSharedChatChannels(eligibleLive);
    
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
const ALWAYS_JOINED_CHANNELS = []; // Empty — bot only joins live channels
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
  let token = await getValidToken();
  console.log('[Bot] Username:', username);
  console.log('[Bot] Token:', token.substring(0, 10) + '...');

  // Refresh token every 2 hours to prevent stale Helix calls
  setInterval(async () => {
    try {
      token = await getValidToken();
      console.log('[Bot] Token refreshed (periodic)');
    } catch (e) {
      console.error('[Bot] Periodic token refresh failed:', e.message);
    }
  }, 2 * 60 * 60 * 1000);

  async function helixGetUser(loginOrId, byId = false) {
    // Use app access token (client credentials) - more reliable than user token
    if (!appToken) appToken = await getAppAccessToken();
    const clientId = getTwitchClientId();
    const param = byId ? `id=${loginOrId}` : `login=${loginOrId.toLowerCase()}`;
    
    let res = await fetch(`https://api.twitch.tv/helix/users?${param}`, {
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${appToken}`
      }
    });
    
    if (res.status === 401) {
      // App token expired, refresh and retry
      appToken = await getAppAccessToken();
      res = await fetch(`https://api.twitch.tv/helix/users?${param}`, {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${appToken}`
        }
      });
    }
    
    if (!res.ok) {
      console.log(`[Bot] helixGetUser failed: ${res.status} for ${param}`);
      return null;
    }
    const data = await res.json();
    return data.data?.[0] || null;
  }

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
      const alwaysJoinedMembers = ALWAYS_JOINED_CHANNELS.map(ch => ({ twitchUsername: ch }));
      const allLiveMembers = [...liveMembers, ...alwaysJoinedMembers];
      const allLiveChannels = dedupeSharedChatChannels(allLiveMembers);
      
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
      const data = await apiCall('/api/tag');
      
      if (data?.currentIt && data?.lastTagTime) {
        const elapsed = Date.now() - data.lastTagTime;
        const elapsedMin = Math.floor(elapsed / 60000);
        console.log(`[Bot] Current it: ${data.currentIt}, elapsed: ${elapsedMin} minutes`);
        
        const itPlayer = data.players?.find(p => p.id === data.currentIt);
        const itUsername = itPlayer?.twitchUsername || 'unknown';
        
        // Live holders should rotate randomly, not force a double-points FFA.
        const liveNow = await getLiveMembersCached(true);
        const itIsLive = liveNow.some(m => (m.twitchUsername || '').toLowerCase() === itUsername.toLowerCase());
        const itLastChat = itPlayer?.lastChatAt || 0;
        const recentlySeenInPlayerChat = Date.now() - itLastChat < AUTO_ROTATE_MINUTES * 60 * 1000;
        const shouldRandomRotate = itIsLive || recentlySeenInPlayerChat;
        
        // FORCE RANDOM after 4-6 hours — no matter what
        if (elapsed > FORCE_RANDOM_IT_HOURS * 60 * 60 * 1000) {
          const isStaleTimeout = elapsed > STALE_LAST_TAG_HOURS * 60 * 60 * 1000;
          console.log(`[Bot] Force random assign after ${elapsedMin} min, stale=${isStaleTimeout}`);
          
          // Pick a random non-immune, non-sleeping player (prefer live ones)
          const eligible = (data.players || []).filter(p => 
            p.id !== data.currentIt && !p.sleepingImmunity && !p.offlineImmunity
          );
          const liveEligible = eligible.filter(p => 
            liveNow.some(m => (m.twitchUsername || '').toLowerCase() === (p.twitchUsername || '').toLowerCase())
          );
          const pool = liveEligible.length > 0 ? liveEligible : eligible;
          
          if (pool.length > 0) {
            const chosen = pool[Math.floor(Math.random() * pool.length)];
            console.log(`[Bot] Random assign to ${chosen.twitchUsername} (${chosen.id})`);
            await apiCall('/api/tag', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'set-it', userId: chosen.id })
            });
            
            if (!isStaleTimeout) {
              const msg = `🎲 ${itUsername} held it too long! ${chosen.twitchUsername} was randomly selected as it! Tag someone!`;
              await broadcastToPlayers(client, msg);
              await apiCall('/api/discord/announce', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tagger: 'System', tagged: chosen.twitchUsername, doublePoints: false, message: 'Random rotation' })
              });
            }
          } else {
            // No eligible players, go to FFA
            await apiCall('/api/tag', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'auto-rotate' })
            });
            if (!isStaleTimeout) {
              await broadcastToPlayers(client, '⏰ No eligible players — FREE FOR ALL! Anyone can tag for DOUBLE POINTS! 🔥');
            }
          }
          lastFfaAnnouncedAt = 0;
          
        } else if (elapsed > AUTO_ROTATE_MINUTES * 60 * 1000) {
          // 40+ min timeout
          if (shouldRandomRotate) {
            // If they are still live or recently seen in any participating chat, rotate normally.
            console.log(`[Bot] ${itUsername} is still active enough to avoid FFA — random assign (live=${itIsLive}, recentChat=${recentlySeenInPlayerChat})`);
            const eligible = (data.players || []).filter(p => 
              p.id !== data.currentIt && !p.sleepingImmunity && !p.offlineImmunity
            );
            const liveEligible = eligible.filter(p => 
              liveNow.some(m => (m.twitchUsername || '').toLowerCase() === (p.twitchUsername || '').toLowerCase())
            );
            const pool = liveEligible.length > 0 ? liveEligible : eligible;
            
            if (pool.length > 0) {
              const chosen = pool[Math.floor(Math.random() * pool.length)];
              await apiCall('/api/tag', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'set-it', userId: chosen.id })
              });
              const msg = `⏰ ${itUsername} didn't tag anyone! ${chosen.twitchUsername} is now randomly it! Tag someone!`;
              await broadcastToPlayers(client, msg);
              lastFfaAnnouncedAt = 0;
            } else {
              // No one to assign to, go FFA
              await apiCall('/api/tag', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'auto-rotate' })
              });
              await broadcastToPlayers(client, '⏰ Auto-rotate: FREE FOR ALL! Anyone can tag for DOUBLE POINTS! 🔥');
              lastFfaAnnouncedAt = Date.now();
            }
          } else {
            // Only grant FFA if they are neither live nor recently seen in player chats.
            console.log(`[Bot] ${itUsername} is inactive and unseen, triggering FFA`);
            await apiCall('/api/tag', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'auto-rotate' })
            });
            await broadcastToPlayers(client, '⏰ Auto-rotate: FREE FOR ALL! Anyone can tag for DOUBLE POINTS! 🔥');
            lastFfaAnnouncedAt = Date.now();
          }
        }
      } else {
        // No one is it — FFA mode
        console.log('[Bot] No current it or lastTagTime');
        
        // Re-announce FFA every 60 minutes
        if (lastFfaAnnouncedAt > 0 && Date.now() - lastFfaAnnouncedAt > FFA_REANNOUNCE_MINUTES * 60 * 1000) {
          console.log('[Bot] Re-announcing FFA (60 min reminder)');
          await broadcastToPlayers(client, '🔥 Reminder: FREE FOR ALL is active! Type "@spmt tag @username" for DOUBLE POINTS! Type "@spmt join" to play! 🔥');
          lastFfaAnnouncedAt = Date.now();
        } else if (lastFfaAnnouncedAt === 0) {
          lastFfaAnnouncedAt = Date.now();
        }
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
        const currentlyLive = dedupeSharedChatChannels(allLiveMembers);

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
            // Subscribe EventSub for new channel
            if (eventSubSessionId) {
              const broadcaster = await lookupBroadcasterId(ch);
              if (broadcaster) await subscribeToChannelEvents(broadcaster.id);
            }
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

  // ── Pass granting + announcement helper ──
  async function announceGrantedPass(channel, login, reason, passCount) {
    const targetChannel = String(channel || '').replace(/^#/, '').toLowerCase();
    if (!targetChannel || !login) return;

    const reasonLabel = reason ? ` for ${reason}` : '';
    const message = `🎟️ Thanks for the support, @${login}! Here's an SPMT Pass${reasonLabel}! 🎁 You now have ${passCount || 1}/3 passes. Use "@spmt pass @username" to tag ANYONE for DOUBLE POINTS — even if you're not it!`;
    await sendChatWithSharedFallback(client, targetChannel, message, { warnOnFallback: true });
  }

  async function grantPassForEvent(channel, userId, login, reason) {
    console.log(`[Event] 🎫 Grant pass: ${login} (${userId}) — ${reason}`);
    const result = await apiCall('/api/tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'grant-pass', userId, twitchUsername: login, reason })
    }).catch(() => null);
    if (result?.granted) {
      console.log(`[Event] ✅ Pass granted to ${login} (${result.passCount}/3)`);
      await announceGrantedPass(channel, login, reason, result.passCount);
    } else {
      console.log(`[Event] ⏭️ Pass not granted to ${login}: ${result?.reason || 'already has one / not a player'}`);
    }
    // Log to mod-log
    await apiCall('/api/tag/mod-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'system', action: 'grant-pass', target: login, detail: reason, channel })
    }).catch(() => {});
    return result;
  }

  // ── TMI.js fallback event handlers (kept as backup, EventSub is primary) ──
  client.on('submysterygift', async (channel, username, numbOfSubs, methods, userstate) => {
    const login = (userstate['login'] || username || '').toLowerCase();
    const uid = userstate['user-id'] ? `user_${userstate['user-id']}` : null;
    if (!login || !uid) return;
    console.log(`[TMI-Event] Gift sub: ${login} gifted ${numbOfSubs} subs`);
    forwardToDSH({ type: 'gift_sub', twitchLogin: login, twitchId: userstate['user-id'], username: login, channel: channel.replace('#', ''), quantity: numbOfSubs });
    await grantPassForEvent(channel, uid, login, `gifted ${numbOfSubs} subs (tmi)`);
  });

  client.on('subscription', async (channel, username, method, message, userstate) => {
    const login = (userstate['login'] || username || '').toLowerCase();
    const uid = userstate['user-id'] ? `user_${userstate['user-id']}` : null;
    if (!login || !uid) return;
    console.log(`[TMI-Event] Subscription: ${login}`);
    forwardToDSH({ type: 'subscription', twitchLogin: login, twitchId: userstate['user-id'], username: login, channel: channel.replace('#', '') });
    await grantPassForEvent(channel, uid, login, `subscribed (tmi)`);
  });

  client.on('resub', async (channel, username, months, message, userstate, methods) => {
    const login = (userstate['login'] || username || '').toLowerCase();
    const uid = userstate['user-id'] ? `user_${userstate['user-id']}` : null;
    if (!login || !uid) return;
    console.log(`[TMI-Event] Resub: ${login} (${months} months)`);
    forwardToDSH({ type: 'subscription', twitchLogin: login, twitchId: userstate['user-id'], username: login, channel: channel.replace('#', '') });
    await grantPassForEvent(channel, uid, login, `resubscribed ${months}mo (tmi)`);
  });

  client.on('cheer', async (channel, userstate, message) => {
    const bits = parseInt(userstate.bits || '0');
    const login = (userstate['username'] || '').toLowerCase();
    const uid = userstate['user-id'] ? `user_${userstate['user-id']}` : null;
    if (!login || !uid) return;
    console.log(`[TMI-Event] Cheer: ${login} cheered ${bits} bits`);
    forwardToDSH({ type: 'cheer', twitchLogin: login, twitchId: userstate['user-id'], username: login, channel: channel.replace('#', ''), bits });
    if (bits < 100) return;
    await grantPassForEvent(channel, uid, login, `cheered ${bits} bits (tmi)`);
  });

  client.on('raided', async (channel, username, viewers) => {
    const login = (username || '').toLowerCase();
    console.log(`[TMI-Event] Raid: ${login} raided with ${viewers} viewers`);
    forwardToDSH({ type: 'raid', twitchLogin: login, username: login, channel: channel.replace('#', ''), viewers });
    // We don't have user-id from raided event, look it up
    const twitchUser = await helixGetUser(login);
    if (!twitchUser) return;
    const uid = `user_${twitchUser.id}`;
    await grantPassForEvent(channel, uid, login, `raided with ${viewers} viewers (tmi)`);
  });

  // ── EventSub WebSocket (primary event source) ──
  async function getEventSubToken() {
    // Use the bot's USER token — EventSub channel events require user auth, not app auth
    // The bot token is already validated/refreshed by getValidToken()
    return env.TWITCH_BOT_TOKEN;
  }

  async function lookupBroadcasterId(login) {
    if (broadcasterIdCache.has(login)) return broadcasterIdCache.get(login);
    const user = await helixGetUser(login);
    if (!user) return null;
    const entry = { id: user.id, login: user.login };
    broadcasterIdCache.set(login, entry);
    return entry;
  }

  async function subscribeEventSub(type, version, condition) {
    const token = await getEventSubToken();
    const clientId = getTwitchClientId();
    const key = `${type}:${JSON.stringify(condition)}`;
    if (eventSubSubscriptions.has(key)) return;

    const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        version,
        condition,
        transport: { method: 'websocket', session_id: eventSubSessionId },
      }),
    });

    if (res.ok) {
      eventSubSubscriptions.add(key);
      console.log(`[EventSub] ✅ Subscribed: ${type} for ${JSON.stringify(condition)}`);
    } else {
      const text = await res.text();
      // 409 = already exists, that's fine
      if (res.status === 409) {
        eventSubSubscriptions.add(key);
      } else {
        console.error(`[EventSub] ❌ Subscribe failed ${type}: ${res.status} ${text}`);
      }
    }
  }

  async function subscribeToChannelEvents(broadcasterId) {
    const cond = { broadcaster_user_id: broadcasterId };
    await subscribeEventSub('channel.follow', '2', { ...cond, moderator_user_id: broadcasterId });
    await subscribeEventSub('channel.subscribe', '1', cond);
    await subscribeEventSub('channel.subscription.gift', '1', cond);
    await subscribeEventSub('channel.subscription.message', '1', cond);
    await subscribeEventSub('channel.cheer', '1', cond);
    await subscribeEventSub('channel.raid', '1', { to_broadcaster_user_id: broadcasterId });
  }

  function handleEventSubNotification(payload) {
    const type = payload?.subscription?.type;
    const event = payload?.event;
    if (!type || !event) return;

    const login = (event.user_login || event.user_name || '').toLowerCase();
    const userId = event.user_id ? `user_${event.user_id}` : null;
    const broadcasterLogin = (event.broadcaster_user_login || '').toLowerCase();

    switch (type) {
      case 'channel.follow': {
        console.log(`[EventSub] 🆕 Follow: ${login} followed ${broadcasterLogin}`);
        if (userId && login) {
          grantPassForEvent(broadcasterLogin, userId, login, `followed ${broadcasterLogin}`);
        }
        break;
      }
      case 'channel.subscribe': {
        if (event.is_gift) break; // gift subs handled by subscription.gift
        console.log(`[EventSub] ⭐ Subscribe: ${login} subscribed to ${broadcasterLogin} (tier ${event.tier})`);
        if (userId && login) {
          grantPassForEvent(broadcasterLogin, userId, login, `subscribed tier ${event.tier}`);
        }
        break;
      }
      case 'channel.subscription.gift': {
        const total = event.total || 1;
        console.log(`[EventSub] 🎁 Gift subs: ${login} gifted ${total} subs in ${broadcasterLogin}`);
        if (userId && login) {
          grantPassForEvent(broadcasterLogin, userId, login, `gifted ${total} subs`);
        }
        break;
      }
      case 'channel.subscription.message': {
        const months = event.cumulative_months || event.duration_months || 1;
        console.log(`[EventSub] 🔄 Resub: ${login} resubbed ${months}mo in ${broadcasterLogin}`);
        if (userId && login) {
          grantPassForEvent(broadcasterLogin, userId, login, `resubscribed ${months}mo`);
        }
        break;
      }
      case 'channel.cheer': {
        const bits = event.bits || 0;
        console.log(`[EventSub] 💎 Cheer: ${login} cheered ${bits} bits in ${broadcasterLogin}`);
        if (bits >= 100 && userId && login) {
          grantPassForEvent(broadcasterLogin, userId, login, `cheered ${bits} bits`);
        }
        break;
      }
      case 'channel.raid': {
        const raiderLogin = (event.from_broadcaster_user_login || '').toLowerCase();
        const raiderId = event.from_broadcaster_user_id ? `user_${event.from_broadcaster_user_id}` : null;
        const viewers = event.viewers || 0;
        const targetLogin = (event.to_broadcaster_user_login || '').toLowerCase();
        console.log(`[EventSub] 🚀 Raid: ${raiderLogin} raided ${targetLogin} with ${viewers} viewers`);
        if (raiderId && raiderLogin) {
          grantPassForEvent(targetLogin, raiderId, raiderLogin, `raided with ${viewers} viewers`);
        }
        break;
      }
      default:
        console.log(`[EventSub] Unhandled type: ${type}`);
    }
  }

  function connectEventSub(url = 'wss://eventsub.wss.twitch.tv/ws') {
    if (eventSubSocket) {
      try { eventSubSocket.close(); } catch {}
      eventSubSocket = null;
    }
    eventSubSubscriptions.clear();

    console.log(`[EventSub] Connecting to ${url}...`);
    eventSubSocket = new WebSocket(url);

    eventSubSocket.on('open', () => {
      console.log('[EventSub] Socket open, waiting for session_welcome...');
    });

    eventSubSocket.on('close', (code, reason) => {
      console.warn(`[EventSub] Socket closed: ${code} ${reason?.toString?.() || ''}`);
      scheduleEventSubReconnect();
    });

    eventSubSocket.on('error', (err) => {
      console.error('[EventSub] Socket error:', err.message);
    });

    eventSubSocket.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const messageType = msg?.metadata?.message_type;

        if (messageType === 'session_welcome') {
          eventSubSessionId = msg?.payload?.session?.id;
          console.log(`[EventSub] ✅ Session established: ${eventSubSessionId}`);
          // Subscribe to events for all currently joined channels
          await subscribeEventSubForJoinedChannels();
          return;
        }

        if (messageType === 'session_reconnect') {
          const reconnectUrl = msg?.payload?.session?.reconnect_url;
          if (reconnectUrl) {
            console.log('[EventSub] Reconnect requested, connecting to new URL...');
            connectEventSub(reconnectUrl);
          }
          return;
        }

        if (messageType === 'session_keepalive') return; // silent

        if (messageType === 'notification') {
          handleEventSubNotification(msg.payload);
          return;
        }
      } catch (err) {
        console.error('[EventSub] Message parse error:', err.message);
      }
    });
  }

  function scheduleEventSubReconnect(delayMs = 5000) {
    if (eventSubReconnectTimer) return;
    console.log(`[EventSub] Reconnecting in ${delayMs}ms...`);
    eventSubReconnectTimer = setTimeout(() => {
      eventSubReconnectTimer = null;
      connectEventSub();
    }, delayMs);
  }

  async function subscribeEventSubForJoinedChannels() {
    if (!eventSubSessionId) return;
    const channels = client.getChannels().map(ch => ch.replace('#', '').toLowerCase());
    console.log(`[EventSub] Subscribing to events for ${channels.length} channels...`);
    for (const ch of channels) {
      const broadcaster = await lookupBroadcasterId(ch);
      if (!broadcaster) continue;
      await subscribeToChannelEvents(broadcaster.id);
      await sleep(200); // rate limit
    }
    console.log(`[EventSub] Subscriptions complete (${eventSubSubscriptions.size} active)`);
  }

  // EventSub disabled — requires per-broadcaster user tokens we don't have.
  // TMI.js handlers (subscription, resub, submysterygift, cheer, raided) are the primary event source.
  // To enable EventSub later, call connectEventSub() here after implementing per-user OAuth.
  console.log('[Bot] EventSub disabled (needs per-broadcaster auth). Using TMI.js events.');

  client.on('message', async (channel, tags, message, self) => {
    if (self) return;
    
    const senderLogin = (tags['username'] || '').toLowerCase();
    const senderUserId = tags['user-id'] ? `user_${tags['user-id']}` : null;
    
    // Detect cheers from message tags (TMI cheer event is unreliable)
    const msgBits = parseInt(tags.bits || '0');
    if (msgBits > 0 && senderLogin && senderUserId) {
      console.log(`[Cheer-Detect] ${senderLogin} cheered ${msgBits} bits in ${channel}`);
      forwardToDSH({ type: 'cheer', twitchLogin: senderLogin, twitchId: senderUserId, username: senderLogin, channel: channel.replace('#', ''), bits: msgBits });
      if (msgBits >= 100) {
        grantPassForEvent(channel.replace('#', ''), senderUserId, senderLogin, `cheered ${msgBits} bits`);
      }
    }

    // Detect sub/resub from message tags (TMI sub events can be unreliable)
    const msgType = tags['msg-id'];
    if (senderLogin && senderUserId && (msgType === 'sub' || msgType === 'resub' || msgType === 'subgift' || msgType === 'submysterygift')) {
      const months = tags['msg-param-cumulative-months'] || tags['msg-param-months'] || '1';
      const giftCount = tags['msg-param-mass-gift-count'] || '1';
      if (msgType === 'submysterygift') {
        console.log(`[Sub-Detect] ${senderLogin} gifted ${giftCount} subs in ${channel}`);
        forwardToDSH({ type: 'gift_sub', twitchLogin: senderLogin, twitchId: senderUserId, username: senderLogin, channel: channel.replace('#', ''), quantity: parseInt(giftCount) });
        grantPassForEvent(channel.replace('#', ''), senderUserId, senderLogin, `gifted ${giftCount} subs`);
      } else if (msgType === 'subgift') {
        // individual gift sub notification — skip, submysterygift covers the gifter
      } else {
        console.log(`[Sub-Detect] ${senderLogin} ${msgType} (${months}mo) in ${channel}`);
        forwardToDSH({ type: 'subscription', twitchLogin: senderLogin, twitchId: senderUserId, username: senderLogin, channel: channel.replace('#', '') });
        grantPassForEvent(channel.replace('#', ''), senderUserId, senderLogin, `${msgType} ${months}mo`);
      }
    }

    // Track chat activity for ALL messages from players (not just commands)
    // Resolve shared chat source so lastSeenChannel reflects the actual streamer
    if (senderLogin && senderUserId && !BLACKLIST.includes(senderLogin)) {
      const rawCh = channel.replace('#', '').toLowerCase();
      const srcRoomId = tags['source-room-id'] || tags['source-id'];
      const roomId = tags['room-id'];
      const isShared = Boolean(roomId && srcRoomId && roomId !== srcRoomId);
      const resolvedChannel = isShared
        ? await resolveChannelFromRoomId(srcRoomId, rawCh)
        : rawCh;
      const activityChannel = (resolvedChannel !== senderLogin) ? resolvedChannel : undefined;
      // Forward chat to DSH for leaderboard points
      forwardToDSH({ type: 'chat', twitchLogin: senderLogin, twitchId: tags['user-id'], username: tags['display-name'] || senderLogin, channel: resolvedChannel });
      apiCall('/api/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'chat-activity', 
          userId: senderUserId, 
          twitchUsername: senderLogin,
          channel: activityChannel
        })
      }).catch(() => {}); // fire and forget
    }
    
    const rawMessage = message.trim();
    const msg = rawMessage.toLowerCase();
    if (!msg.startsWith('@spmt ') && !msg.startsWith('spmt ')) return;
    // Normalize: ensure @spmt prefix
    const normalizedMsg = msg.startsWith('spmt ') ? '@' + rawMessage.trim() : rawMessage.trim();

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
    
    const args = normalizedMsg.toLowerCase().split(/\s+/).slice(1);
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
        const twitchUser = await helixGetUser(targetUser.toLowerCase());
        
        if (!twitchUser) {
          console.log(`[Bot] User ${targetUser} not found on Twitch`);
          reply( `@${user} User ${targetUser} not found on Twitch!`);
          return;
        }
        
        const targetId = `user_${twitchUser.id}`;
        const targetLogin = twitchUser.login.toLowerCase();
        const targetDisplay = twitchUser.display_name;
        const targetAvatar = twitchUser.profile_image_url || '';
        
        const res = await apiCall('/api/tag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'join', userId: targetId, twitchUsername: targetLogin, avatar: targetAvatar })
        });
        console.log(`[Bot] Join result: ${JSON.stringify(res)}`);
        
        // Also add to bot channels so the bot tracks their live status
        if (!res?.error) {
          await apiCall('/api/bot/channels/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: targetLogin })
          });
        }
        
        reply( res?.error ? `@${user} ${res.error}` : `@${targetDisplay} joined the tag game! 🎯 Type "@spmt join" to play too!`);
      } else {
        console.log(`[Bot] ${user} joining themselves`);
        // User joining themselves - get their avatar and login from Twitch
        const twitchUser = await helixGetUser(tags['user-id'], true);
        const avatarUrl = twitchUser?.profile_image_url || '';
        const loginName = twitchUser?.login?.toLowerCase() || user.toLowerCase();
        console.log(`[Bot] Got avatar: ${avatarUrl}, login: ${loginName}`);
        
        const res = await apiCall('/api/tag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'join', userId, twitchUsername: loginName, avatar: avatarUrl })
        });
        console.log(`[Bot] Join result: ${JSON.stringify(res)}`);
        
        // Also add to bot channels so the bot tracks their live status
        if (!res?.error) {
          await apiCall('/api/bot/channels/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: loginName })
          });
        }
        
        try {
          await reply( res?.error ? `@${user} ${res.error}` : `@${user} joined the tag game! 🎯 Type "@spmt join" to play too!`);
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
      
      // Check if tagger is in the game and log their state
      const taggerPlayer = playersData?.players?.find(p => p.id === userId);
      const anyoneIsIt = playersData?.players?.some(p => p.isIt);
      console.log(`[Bot] Tagger ${user} (${userId}): isIt=${taggerPlayer?.isIt}, anyoneIt=${anyoneIsIt}, targetId=${targetPlayer.id}`);
      
      console.log(`[Bot] Calling tag API...`);
      const res = await apiCall('/api/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tag', userId, twitchUsername: senderLogin, targetUserId: targetPlayer.id, streamerId: channelName })
      });
      console.log(`[Bot] Tag API response: ${JSON.stringify(res)}`);
      
      if (res?.error) {
        console.log(`[Bot] Tag error: ${res.error}`);
        reply( `@${user} ${res.error}`);
        return;
      } else {
        const msg = res.doublePoints 
          ? `🔥 ${user} tagged @${target} for DOUBLE POINTS! @${target} is now it! 🔥 Type "@spmt join" to play!`
          : `🎯 ${user} tagged @${target}! @${target} is now it! Type "@spmt join" to play!`;
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
        // Mod log
        await apiCall('/api/tag/mod-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor: user, action: 'tag', target, detail: res.doublePoints ? 'double points' : '', channel: channelName })
        }).catch(() => {});
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
      await apiCall('/api/tag/mod-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: user, action: 'sleep', target: targetName, channel: channelName })
      }).catch(() => {});
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
      await apiCall('/api/tag/mod-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: user, action: 'wake', target: targetName, channel: channelName })
      }).catch(() => {});
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
      if (!global.lastListCmd) global.lastListCmd = {};
      global.lastListCmd[userId] = 'players';
      const data = await apiCall('/api/tag');
      const players = data?.players || [];
      const liveNow = await getLiveMembersCached();
      const liveSet = new Set(liveNow.map(m => (m.twitchUsername || '').toLowerCase()));
      const now = Date.now();
      const ACTIVE_THRESHOLD = 40 * 60 * 1000;
      
      const live = [];
      const chatting = [];
      const offline = [];
      
      for (const p of players) {
        const uname = (p.twitchUsername || p.username || '').toLowerCase();
        const lastChat = p.lastChatAt || 0;
        const isLive = liveSet.has(uname);
        const isChatting = !isLive && lastChat && (now - lastChat < ACTIVE_THRESHOLD);
        const isSleeping = p.sleepingImmunity || p.offlineImmunity;
        
        if (isLive) live.push({ ...p, _status: '🟢' });
        else if (isChatting) chatting.push({ ...p, _status: '💬' });
        else offline.push({ ...p, _status: isSleeping ? '😴' : '' });
      }
      
      const all = [...live, ...chatting, ...offline];
      const perPage = 15;
      const pages = [];
      for (let i = 0; i < all.length; i += perPage) {
        pages.push(all.slice(i, i + perPage));
      }
      if (pages.length === 0) pages.push([]);

      if (!global.playerPages) global.playerPages = {};
      // "players" always resets to page 1, "more" advances
      if (cmd === 'players') global.playerPages[userId] = 0;
      
      const page = global.playerPages[userId] || 0;
      const totalPages = pages.length;
      const currentPagePlayers = pages[page] || [];
      const pageNames = currentPagePlayers.map(p => {
        const name = p.twitchUsername || p.username;
        return p._status ? `${p._status}${name}` : name;
      }).join(', ');

      reply(`@${user} ${players.length} players [🟢${live.length} 💬${chatting.length}] (${page + 1}/${totalPages}): ${pageNames || 'none'}${page + 1 < totalPages ? ' | "@spmt more" for next' : ''}`);
      
      global.playerPages[userId] = (page + 1) % totalPages;
    }

    else if (cmd === 'more') {
      const lastCmd = global.lastListCmd?.[userId] || 'players';
      // Re-run the last list command to advance the page
      if (lastCmd === 'live') {
        // Trigger live logic
        const liveData = await apiCall('/api/discord/live-members');
        const playersData = await apiCall('/api/tag');
        const players = playersData?.players || [];
        const playerSet = new Set(players.map(p => (p.twitchUsername || p.username)?.toLowerCase()).filter(Boolean));
        const liveMembers = (liveData?.liveMembers || []).filter(m => playerSet.has(m.twitchUsername?.toLowerCase()));
        const liveLogins = new Set(liveMembers.map(m => (m.twitchUsername || '').toLowerCase()));
        
        if (liveMembers.length === 0) {
          reply(`@${user} No players are live right now!`);
          return;
        }
        
        const now = Date.now();
        const ACTIVE_THRESHOLD = 40 * 60 * 1000;
        const channelChatters = {};
        for (const p of players) {
          const pName = (p.twitchUsername || p.username || '').toLowerCase();
          if (liveLogins.has(pName)) continue;
          const lastChat = p.lastChatAt || 0;
          const ch = (p.lastSeenChannel || '').toLowerCase();
          if ((now - lastChat) > ACTIVE_THRESHOLD) continue;
          if (ch === 'discord') {
            if (!channelChatters['_discord']) channelChatters['_discord'] = [];
            channelChatters['_discord'].push(pName);
          } else if (ch && liveLogins.has(ch)) {
            if (!channelChatters[ch]) channelChatters[ch] = [];
            channelChatters[ch].push(pName);
          }
        }

        const groups = [];
        let totalChatters = 0;
        for (const m of liveMembers) {
          const login = (m.twitchUsername || '').toLowerCase();
          const chatters = channelChatters[login] || [];
          totalChatters += chatters.length;
          const chatterStr = chatters.length > 0 ? ` > 💬${chatters.join(', ')}` : '';
          groups.push(`🟢${login}${chatterStr}`);
        }
        const discordChatters = channelChatters['_discord'] || [];
        if (discordChatters.length > 0) {
          totalChatters += discordChatters.length;
          groups.push(`🟣Discord > 💬${discordChatters.join(', ')}`);
        }
        const MAX_LEN = 400;
        const pages = [[]];
        let currentLen = 0;
        for (const group of groups) {
          const addLen = (pages[pages.length - 1].length > 0 ? 3 : 0) + group.length;
          if (currentLen + addLen > MAX_LEN && pages[pages.length - 1].length > 0) {
            pages.push([]);
            currentLen = 0;
          }
          pages[pages.length - 1].push(group);
          currentLen += (currentLen > 0 ? 3 : 0) + group.length;
        }
        if (pages.length === 1 && pages[0].length === 0) pages[0] = [];
        
        if (!global.livePages) global.livePages = {};
        const page = global.livePages[userId] || 0;
        const totalPages = pages.length;
        const pageContent = (pages[page] || []).join(' | ');
        
        reply(`@${user} 🟢${liveMembers.length} live 💬${totalChatters} chatting (${page + 1}/${totalPages}): ${pageContent || 'none'}${page + 1 < totalPages ? ' | "@spmt more" for next' : ''}`);
        global.livePages[userId] = (page + 1) % totalPages;
      } else {
        // Default: advance players list
        const data = await apiCall('/api/tag');
        const players = data?.players || [];
        const liveNow = await getLiveMembersCached();
        const liveSet = new Set(liveNow.map(m => (m.twitchUsername || '').toLowerCase()));
        const now = Date.now();
        const ACTIVE_THRESHOLD = 40 * 60 * 1000;
        
        const live = [];
        const chatting = [];
        const offline = [];
        for (const p of players) {
          const uname = (p.twitchUsername || p.username || '').toLowerCase();
          const lastChat = p.lastChatAt || 0;
          const isLive = liveSet.has(uname);
          const isChatting = !isLive && lastChat && (now - lastChat < ACTIVE_THRESHOLD);
          const isSleeping = p.sleepingImmunity || p.offlineImmunity;
          if (isLive) live.push({ ...p, _status: '🟢' });
          else if (isChatting) chatting.push({ ...p, _status: '💬' });
          else offline.push({ ...p, _status: isSleeping ? '😴' : '' });
        }
        
        const all = [...live, ...chatting, ...offline];
        const perPage = 15;
        const pages = [];
        for (let i = 0; i < all.length; i += perPage) {
          pages.push(all.slice(i, i + perPage));
        }
        if (pages.length === 0) pages.push([]);
        
        if (!global.playerPages) global.playerPages = {};
        const page = global.playerPages[userId] || 0;
        const totalPages = pages.length;
        const currentPagePlayers = pages[page] || [];
        const pageNames = currentPagePlayers.map(p => {
          const name = p.twitchUsername || p.username;
          return p._status ? `${p._status}${name}` : name;
        }).join(', ');
        
        reply(`@${user} ${players.length} players [🟢${live.length} 💬${chatting.length}] (${page + 1}/${totalPages}): ${pageNames || 'none'}${page + 1 < totalPages ? ' | "@spmt more" for next' : ''}`);
        global.playerPages[userId] = (page + 1) % totalPages;
      }
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
        `@${user} Mod/Admin: "@spmt givepass @user" = Give pass | "@spmt newcard" = New bingo card | "@spmt newcard phrase1|phrase2|..." = Custom 25 phrases | "@spmt support" = Help ticket | "@spmt sleep @user" = Set away | "@spmt wake @user" = Clear away | "@spmt mute" = Mute bot | "@spmt unmute" = Unmute`
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
      if (!global.lastListCmd) global.lastListCmd = {};
      global.lastListCmd[userId] = 'live';
      const liveData = await apiCall('/api/discord/live-members');
      const playersData = await apiCall('/api/tag');
      const players = playersData?.players || [];
      const playerSet = new Set(players.map(p => (p.twitchUsername || p.username)?.toLowerCase()).filter(Boolean));
      const liveMembers = (liveData?.liveMembers || []).filter(m => playerSet.has(m.twitchUsername?.toLowerCase()));
      const liveLogins = new Set(liveMembers.map(m => (m.twitchUsername || '').toLowerCase()));
      
      if (liveMembers.length === 0) {
        reply(`@${user} No players are live right now!`);
        return;
      }
      
      const now = Date.now();
      const ACTIVE_THRESHOLD = 40 * 60 * 1000;
      
      // Group active chatters by lastSeenChannel
      const channelChatters = {};
      for (const p of players) {
        const pName = (p.twitchUsername || p.username || '').toLowerCase();
        if (liveLogins.has(pName)) continue; // skip live streamers themselves
        const lastChat = p.lastChatAt || 0;
        const ch = (p.lastSeenChannel || '').toLowerCase();
        if ((now - lastChat) > ACTIVE_THRESHOLD) continue;
        if (ch === 'discord') {
          if (!channelChatters['_discord']) channelChatters['_discord'] = [];
          channelChatters['_discord'].push(pName);
        } else if (ch && liveLogins.has(ch)) {
          if (!channelChatters[ch]) channelChatters[ch] = [];
          channelChatters[ch].push(pName);
        }
      }
      
      // Build grouped output: 🟢streamer > 💬chatter1, chatter2 | 🟣Discord > 💬user1, user2
      const groups = [];
      let totalChatters = 0;
      for (const m of liveMembers) {
        const login = (m.twitchUsername || '').toLowerCase();
        const chatters = channelChatters[login] || [];
        totalChatters += chatters.length;
        const chatterStr = chatters.length > 0 ? ` > 💬${chatters.join(', ')}` : '';
        groups.push(`🟢${login}${chatterStr}`);
      }
      const discordChatters = channelChatters['_discord'] || [];
      if (discordChatters.length > 0) {
        totalChatters += discordChatters.length;
        groups.push(`🟣Discord > 💬${discordChatters.join(', ')}`);
      }
      
      // Fit as many groups as possible per message (Twitch 500 char limit)
      const MAX_LEN = 400;
      const pages = [[]];
      let currentLen = 0;
      for (const group of groups) {
        const addLen = (pages[pages.length - 1].length > 0 ? 3 : 0) + group.length; // 3 for ' | '
        if (currentLen + addLen > MAX_LEN && pages[pages.length - 1].length > 0) {
          pages.push([]);
          currentLen = 0;
        }
        pages[pages.length - 1].push(group);
        currentLen += (currentLen > 0 ? 3 : 0) + group.length;
      }
      if (pages.length === 1 && pages[0].length === 0) pages[0] = [];
      
      if (!global.livePages) global.livePages = {};
      if (cmd === 'live') global.livePages[userId] = 0;
      
      const page = global.livePages[userId] || 0;
      const totalPages = pages.length;
      const pageContent = (pages[page] || []).join(' | ');
      
      reply(`@${user} 🟢${liveMembers.length} live 💬${totalChatters} chatting (${page + 1}/${totalPages}): ${pageContent || 'none'}${page + 1 < totalPages ? ' | "@spmt more" for next' : ''}`);
      
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
      reply( `@${user} Rank: #${rank}/${sorted.length} | Score: ${player.score || 0} pts | Tags: ${player.tags || 0} | Tagged: ${player.tagged || 0} | 🎟️ Pass: ${player.passCount || (player.hasPass ? 1 : 0)}/${3}`);
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
      reply( `@${user} Tag Rules: Tag someone with "@spmt tag @user" in their chat. If you're it, tag someone else! "@spmt sleep" = go immune. "@spmt pass @user" = earned double-points tag. Full guide: https://chat-tag-new.fly.dev/about`);
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
      
      if (!card?.phrases || card.phrases.length === 0) {
        reply(`@${user} No bingo card yet! An admin can create one with "@spmt newcard"`);
        return;
      }

      const covered = card.covered || {};
      const rows = [];
      for (let row = 0; row < 5; row++) {
        const cells = [];
        for (let col = 0; col < 5; col++) {
          const idx = row * 5 + col;
          cells.push(`${covered[idx] ? '🟩' : '⬜'}${String(idx).padStart(2, '0')}`);
        }
        rows.push(cells.join(' '));
      }
      const claimed = Object.keys(covered).length;
      await reply(`@${user} Bingo [${claimed}/25]: ${rows.join(' | ')} — "@spmt phrases" for text, "@spmt claim [0-24]" to mark — ${API_BASE}/api/bingo/share?format=txt`);
    }

    else if (cmd === 'share' || cmd === 'export') {
      reply(`@${user} View and download bingo state (JSON or TXT): ${API_BASE}/api/bingo/share`);
    }
    
    else if (cmd === 'phrases') {
      const data = await apiCall('/api/bingo/state');
      const card = data?.bingo;
      
      if (!card?.phrases || card.phrases.length === 0) {
        reply(`@${user} No bingo card yet!`);
        return;
      }
      
      // Show phrases in pages of 5
      if (!global.phrasePages) global.phrasePages = {};
      if (!global.phrasePages[userId]) global.phrasePages[userId] = 0;
      
      const page = global.phrasePages[userId];
      const start = page * 5;
      const end = Math.min(start + 5, card.phrases.length);
      const covered = card.covered || {};
      
      const lines = [];
      for (let i = start; i < end; i++) {
        const mark = covered[i] ? '✅' : '⬜';
        lines.push(`${mark}${i}: ${card.phrases[i]}`);
      }
      
      const totalPages = Math.ceil(card.phrases.length / 5);
      reply(`@${user} Bingo (${page + 1}/${totalPages}): ${lines.join(' | ')}${page + 1 < totalPages ? ' — "@spmt phrases" for more' : ''} | Full board + download: ${API_BASE}/api/bingo/share?format=txt`);
      
      global.phrasePages[userId] = (page + 1) % totalPages;
    }
    
    else if (cmd === 'newcard') {
      if (!isAdminUser) {
        reply(`@${user} Only mods/admins can create a new bingo card.`);
        return;
      }
      
      // Custom phrases from args or use defaults
      const customPhrases = args.slice(1).join(' ').split('|').map(p => p.trim()).filter(Boolean);
      
      if (customPhrases.length > 0 && customPhrases.length < 25) {
        reply(`@${user} Need exactly 25 phrases separated by | (got ${customPhrases.length}). Or use "@spmt newcard" with no args for defaults.`);
        return;
      }
      
      if (customPhrases.length === 25) {
        await apiCall('/api/bingo/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reset', phrases: customPhrases })
        });
        reply(`@${user} New bingo card created with custom phrases! Type "@spmt card" to see it.`);
      } else {
        const genResult = await apiCall('/api/bingo/generate', { method: 'POST' });
        const aiNote = genResult?.aiGenerated ? '(AI-generated!)' : '(shuffled phrases)';
        reply(`@${user} New bingo card generated ${aiNote}! "@spmt card" to see it — ${API_BASE}/api/bingo/share?format=txt`);
      }
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
    
    else if (cmd === 'pass') {
      const target = args[1]?.replace('@', '').toLowerCase();
      console.log(`[Bot] Pass command from ${user}, target=${target}`);
      if (!target) {
        reply(`@${user} Usage: "@spmt pass @username" — Pass your tag to someone for DOUBLE POINTS! Earned by gifting subs, cheering 100+ bits, or hype train.`);
        return;
      }
      
      const playersData = await apiCall('/api/tag');
      const targetPlayer = playersData?.players?.find(p => (p.twitchUsername || p.username)?.toLowerCase() === target);
      if (!targetPlayer) {
        reply(`@${user} ${target} is not in the game!`);
        return;
      }
      
      const res = await apiCall('/api/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'use-pass', userId, targetUserId: targetPlayer.id, streamerId: channelName })
      });
      
      if (res?.error) {
        reply(`@${user} ${res.error}`);
      } else {
        const msg = `🎟️ ${user} used their PASS to tag @${target} for DOUBLE POINTS! @${target} is now it! Raid, follow, cheer, or sub to earn yours!`;
        await reply(msg);
        if (!isMuted) {
          await broadcastToPlayers(client, msg, channelName);
        }
        await apiCall('/api/discord/announce', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagger: user, tagged: target, doublePoints: true, message: 'Used a Pass' })
        });
        await apiCall('/api/tag/mod-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor: user, action: 'use-pass', target, detail: 'double points pass', channel: channelName })
        }).catch(() => {});
      }
    }
    
    else if (cmd === 'givepass') {
      if (!isAdminUser) {
        reply(`@${user} Only mods/admins can give passes.`);
        return;
      }
      const target = args[1]?.replace('@', '').toLowerCase();
      if (!target) {
        reply(`@${user} Usage: "@spmt givepass @username"`);
        return;
      }
      const playersData = await apiCall('/api/tag');
      const targetPlayer = playersData?.players?.find(p => (p.twitchUsername || p.username)?.toLowerCase() === target);
      if (!targetPlayer) {
        reply(`@${user} ${target} is not in the game!`);
        return;
      }
      const res = await apiCall('/api/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grant-pass', userId: targetPlayer.id, twitchUsername: target, reason: `gifted by ${user}` })
      });
      if (res?.granted) {
        reply(`🎟️ @${target} got an SPMT Pass from ${user}! 🎁 Use "@spmt pass @username" to tag ANYONE for DOUBLE POINTS!`);
      } else if (res?.reason === 'cooldown') {
        reply(`@${user} ${target} already earned a pass in the last 24h (${res.hoursLeft}h left). They have ${res.passCount || 0}/3 passes.`);
      } else if (res?.reason === 'max-passes') {
        reply(`@${user} ${target} already has the max 3/3 passes!`);
      } else {
        reply(`@${user} ${target} already has a pass or isn't in the game.`);
      }
    }

    else if (cmd === 'help') {
      console.log(`[Bot] Attempting to send help to ${channel}`);
      try {
        await reply( `@${user} "@spmt join" = Join | "@spmt tag @user" = Tag | "@spmt pass @user" = Pass tag (earned) | "@spmt status" = Who's it | "@spmt score" = Stats | "@spmt rank" = Top 3 | "@spmt players" = List | "@spmt live" = Live | "@spmt sleep" = Immune | "@spmt wake" = Unimmune | "@spmt rules" = Rules | Mods: "@spmt mod"`);
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

    if (req.method === 'GET' && req.url === '/eventsub-status') {
      const payload = {
        connected: eventSubSocket?.readyState === WebSocket.OPEN,
        sessionId: eventSubSessionId,
        subscriptionCount: eventSubSubscriptions.size,
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
          if (!message) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'message is required' }));
            return;
          }
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

