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

const commandMarker = "apiCall('/api/game-hub/command'";
const commandTarget = `    const mutedData = await apiCall('/api/bot/muted');\n    const isMuted = mutedData?.muted?.includes(channelName);\n    \n    if (isMirroredSharedMessage) {`;
const commandReplacement = `    const mutedData = await apiCall('/api/bot/muted');\n    const isMuted = mutedData?.muted?.includes(channelName);\n\n    // Games Hub owns only its canonical SPMT namespace. Unknown commands fall\n    // through to the existing Chat Tag parser unchanged.\n    const gamesHubCommand = await apiCall('/api/game-hub/command', {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({\n        channel: channelName,\n        userId: tags['user-id'] || '',\n        username: senderLogin,\n        displayName: user,\n        message: rawMessage,\n        isBroadcaster: tags?.badges?.broadcaster === '1' || senderLogin === channelName,\n        isModerator: Boolean(tags?.mod),\n        isAdmin: isAdminUser,\n      }),\n    });\n    if (gamesHubCommand?.handled) {\n      if (!isMuted && gamesHubCommand.reply) await reply(gamesHubCommand.reply);\n      return;\n    }\n    \n    if (isMirroredSharedMessage) {`;

if (!source.includes(commandMarker)) {
  if (!source.includes(commandTarget)) {
    throw new Error('Games Hub command-router patch target was not found. Refusing to silently skip SPMT routing.');
  }
  source = source.replace(commandTarget, commandReplacement);
}

if (
  !source.includes(chatMarker) ||
  !source.includes("userId: tags['user-id'] || ''") ||
  !source.includes(commandMarker) ||
  !source.includes('gamesHubCommand?.handled') ||
  !source.includes('channel: channelName')
) {
  throw new Error('Games Hub bot patch contract is incomplete.');
}

if (source !== original) fs.writeFileSync(file, source, 'utf8');
console.log('Games Hub bot chat-event + canonical SPMT command patch applied.');
