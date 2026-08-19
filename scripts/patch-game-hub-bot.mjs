import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'bot.js');
const original = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
let source = original;

const marker = "apiCall('/api/game-hub/chat'";
const target = `      // Forward chat to DSH for leaderboard points\n      forwardToDSH({ type: 'chat', twitchLogin: senderLogin, twitchId: tags['user-id'], username: tags['display-name'] || senderLogin, channel: resolvedChannel });\n      apiCall('/api/tag', {`;

const replacement = `      // Forward chat to DSH for leaderboard points\n      forwardToDSH({ type: 'chat', twitchLogin: senderLogin, twitchId: tags['user-id'], username: tags['display-name'] || senderLogin, channel: resolvedChannel });\n\n      // The same resolved source channel feeds ChatTag's modular Games Hub.\n      // This is fire-and-forget: a game overlay outage must never interrupt Tag.\n      apiCall('/api/game-hub/chat', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({\n          channel: resolvedChannel,\n          username: senderLogin,\n          displayName: tags['display-name'] || senderLogin,\n          message,\n          color: tags.color || '',\n          badges: tags.badges || {},\n        }),\n      }).catch(() => {});\n\n      apiCall('/api/tag', {`;

if (!source.includes(marker)) {
  if (!source.includes(target)) {
    throw new Error('Games Hub bot patch target was not found. Refusing to silently skip chat ingestion.');
  }
  source = source.replace(target, replacement);
}

if (!source.includes(marker) || !source.includes("channel: resolvedChannel") || !source.includes('message,')) {
  throw new Error('Games Hub bot patch contract is incomplete.');
}

if (source !== original) fs.writeFileSync(file, source, 'utf8');
console.log('Games Hub bot chat-event patch applied.');
