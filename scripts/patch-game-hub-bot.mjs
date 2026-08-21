import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'bot.js');
const original = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
let source = original;

const chatMarker = "apiCall('/api/game-hub/chat'";
const chatTarget = `      // Forward chat to DSH for leaderboard points\n      forwardToDSH({ type: 'chat', twitchLogin: senderLogin, twitchId: tags['user-id'], username: tags['display-name'] || senderLogin, channel: resolvedChannel });\n      apiCall('/api/tag', {`;

const chatReplacement = `      // Forward chat to DSH for leaderboard points\n      forwardToDSH({ type: 'chat', twitchLogin: senderLogin, twitchId: tags['user-id'], username: tags['display-name'] || senderLogin, channel: resolvedChannel });\n\n      // The same resolved source channel feeds ChatTag's modular Games Hub.\n      // This is fire-and-forget: a game overlay outage must never interrupt Tag.\n      apiCall('/api/game-hub/chat', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({\n          channel: resolvedChannel,\n          userId: tags['user-id'] || '',\n          username: senderLogin,\n          displayName: tags['display-name'] || senderLogin,\n          message,\n          color: tags.color || '',\n          badges: tags.badges || {},\n        }),\n      }).catch(() => {});\n\n      apiCall('/api/tag', {`;

if (!source.includes(chatMarker)) {
  if (!source.includes(chatTarget)) {
    throw new Error('Games Hub bot patch target was not found. Refusing to silently skip chat ingestion.');
  }
  source = source.replace(chatTarget, chatReplacement);
}

const parserTarget = `    const args = normalizedMsg.toLowerCase().split(/\\s+/).slice(1);\n    const cmd = args[0];`;
const parserReplacement = `    let args = normalizedMsg.toLowerCase().split(/\\s+/).slice(1);\n    let cmd = args[0];`;
if (source.includes(parserTarget)) source = source.replace(parserTarget, parserReplacement);
if (!source.includes(parserReplacement)) {
  throw new Error('Games Hub command parser could not be made rewriteable.');
}

// The legacy parser is the source of truth for the original persistent Chat Tag
// command surface. Discover its command names from bot.js so future legacy
// commands automatically remain local instead of being put behind Games Hub.
const legacyChatTagCommands = Array.from(new Set(
  Array.from(original.matchAll(/cmd\s*===\s*'([^']+)'/g), (match) => match[1])
)).sort();
if (!legacyChatTagCommands.includes('score') || !legacyChatTagCommands.includes('live')) {
  throw new Error('Legacy Chat Tag command discovery is incomplete.');
}
const legacyChatTagCommandsLiteral = JSON.stringify(legacyChatTagCommands);

const commandMarker = "apiCall('/api/game-hub/command'";
const commandTarget = `    const mutedData = await apiCall('/api/bot/muted');\n    const isMuted = mutedData?.muted?.includes(channelName);\n    \n    if (isMirroredSharedMessage) {`;
const commandReplacement = `    const mutedData = await apiCall('/api/bot/muted');\n    const isMuted = mutedData?.muted?.includes(channelName);\n\n    // Chat Tag predates Games Hub and is a persistent ecosystem-wide game.\n    // Keep every command already implemented by the legacy parser local so a\n    // Games Hub/API outage can never intercept score, live, tag, pass, etc.\n    const legacyChatTagCommands = new Set(${legacyChatTagCommandsLiteral});\n    const chatTagNamespace = cmd === 'chattag' || cmd === 'taggame';\n    if (chatTagNamespace) {\n      const chatTagAction = args[1] || 'status';\n      if (chatTagAction === 'start') {\n        if (!isMuted) await reply('@' + user + ' Chat Tag is always active globally; no channel start is required. Use "spmt score" to check your score.');\n        return;\n      }\n      if (chatTagAction === 'stop') {\n        if (!isMuted) await reply('@' + user + ' Chat Tag is persistent and cannot be stopped per-channel.');\n        return;\n      }\n      args = [chatTagAction, ...args.slice(2)];\n      cmd = args[0];\n    }\n\n    // Games Hub owns only commands that are not already proven Chat Tag\n    // commands. This ordering is deliberate: legacy Tag never waits on the\n    // Games Hub router before reaching its original handler.\n    if (!legacyChatTagCommands.has(cmd)) {\n      const gamesHubCommand = await apiCall('/api/game-hub/command', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({\n          channel: channelName,\n          userId: tags['user-id'] || '',\n          username: senderLogin,\n          displayName: user,\n          message: rawMessage,\n          isBroadcaster: tags?.badges?.broadcaster === '1' || senderLogin === channelName,\n          isModerator: Boolean(tags?.mod),\n          isAdmin: isAdminUser,\n        }),\n      });\n      if (gamesHubCommand?.rewriteCommand) {\n        const rewritten = String(gamesHubCommand.rewriteCommand || '')\n          .trim()\n          .toLowerCase()\n          .replace(/^!?@?spmt\\s+/, '');\n        args = rewritten.split(/\\s+/).filter(Boolean);\n        cmd = args[0];\n      }\n      if (gamesHubCommand?.handled) {\n        if (!isMuted && gamesHubCommand.reply) await reply(gamesHubCommand.reply);\n        return;\n      }\n    }\n    \n    if (isMirroredSharedMessage) {`;

if (!source.includes('const legacyChatTagCommands = new Set(')) {
  if (!source.includes(commandTarget)) {
    throw new Error('Games Hub command-router patch target was not found. Refusing to silently skip SPMT routing.');
  }
  source = source.replace(commandTarget, commandReplacement);
}

// Bound API waits. Fly can temporarily have no healthy web instance during a
// single-volume rollout; the bot must recover instead of leaving a chat command
// awaiting an HTTP request indefinitely.
const apiTimeoutMarker = 'CHAT_TAG_API_TIMEOUT_MS';
const apiTimeoutTarget = "    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });";
const apiTimeoutReplacement = `    const timeoutMs = Number.parseInt(process.env.CHAT_TAG_API_TIMEOUT_MS || '4000', 10);\n    const signal = options.signal || AbortSignal.timeout(Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 4000);\n    const res = await fetch(\`${'${API_BASE}'}${'${endpoint}'}\`, { ...options, headers, signal });`;
if (!source.includes(apiTimeoutMarker)) {
  if (!source.includes(apiTimeoutTarget)) {
    throw new Error('Chat Tag API timeout patch target was not found.');
  }
  source = source.replace(apiTimeoutTarget, apiTimeoutReplacement);
}

// Keep the original health contract: the bot is healthy only while Twitch IRC
// is connected. Fly checks /health every 30s, so a disconnected bot must remain
// visible as unhealthy instead of being reported as a healthy but silent process.
const healthContract = "res.writeHead(isIrcConnected ? 200 : 503, { 'Content-Type': 'application/json' });";
if (!source.includes(healthContract)) {
  throw new Error('IRC-aware bot health contract is missing. Refusing to mask a disconnected bot as healthy.');
}

// Surface Twitch IRC NOTICE messages without changing send routing. This exposes
// auth, moderation, verification and chat-mode rejections that tmi.js receives.
const noticeMarker = "client.on('notice'";
const noticeTarget = `  client.on('connected', () => {\n    isIrcConnected = true;\n  });\n\n  // Catch unhandled errors to prevent crashes`;
const noticeReplacement = `  client.on('connected', () => {\n    isIrcConnected = true;\n  });\n\n  client.on('notice', (channel, msgId, message) => {\n    const target = String(channel || '').replace(/^#/, '') || 'unknown';\n    console.warn(\`[Bot] Twitch NOTICE channel=\${target} msg-id=\${msgId || 'unknown'}: \${message || ''}\`);\n  });\n\n  // Catch unhandled errors to prevent crashes`;
if (!source.includes(noticeMarker)) {
  if (!source.includes(noticeTarget)) {
    throw new Error('Twitch NOTICE diagnostic patch target was not found.');
  }
  source = source.replace(noticeTarget, noticeReplacement);
}

if (
  !source.includes(chatMarker) ||
  !source.includes("userId: tags['user-id'] || ''") ||
  !source.includes(commandMarker) ||
  !source.includes('gamesHubCommand?.handled') ||
  !source.includes('gamesHubCommand?.rewriteCommand') ||
  !source.includes('let args = normalizedMsg') ||
  !source.includes('const legacyChatTagCommands = new Set(') ||
  !source.includes("const chatTagNamespace = cmd === 'chattag' || cmd === 'taggame'") ||
  !source.includes('if (!legacyChatTagCommands.has(cmd))') ||
  !source.includes(apiTimeoutMarker) ||
  !source.includes(healthContract) ||
  !source.includes(noticeMarker) ||
  !source.includes('channel: channelName')
) {
  throw new Error('Games Hub bot patch contract is incomplete.');
}

if (source !== original) fs.writeFileSync(file, source, 'utf8');
console.log('Games Hub bot chat-event + legacy-safe command + IRC-health diagnostics patch applied.');
