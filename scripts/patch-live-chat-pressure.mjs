import fs from 'node:fs';

const file = 'bot.js';
let source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// Chat Tag presence is durability metadata, not a realtime gameplay stream.
// Persist it at most once per minute per user/channel so normal chat cannot
// create an unbounded queue of full app-state writes.
source = source
  .replace("process.env.CHAT_ACTIVITY_THROTTLE_MS || '15000'", "process.env.CHAT_ACTIVITY_THROTTLE_MS || '60000'")
  .replace('|| 15_000,\n);', '|| 60_000,\n);');

const realtimeMarker = 'Games Hub gameplay events stay realtime; Chat Tag persistence stays throttled.';
if (!source.includes(realtimeMarker)) {
  const startMarker = '      // Chat Tag and Games Hub only need a recent-presence heartbeat.';
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error('Combined Chat Tag/Games Hub heartbeat block was not found.');

  const tagCall = source.indexOf("        apiCall('/api/tag', {", start);
  if (tagCall < 0) throw new Error('Chat Tag heartbeat call was not found.');

  const blockEndMarker = '        }).catch(() => {}); // fire and forget\n      }';
  const blockEndStart = source.indexOf(blockEndMarker, tagCall);
  if (blockEndStart < 0) throw new Error('Combined heartbeat block end was not found.');
  const blockEnd = blockEndStart + blockEndMarker.length;

  const replacement = `      // ${realtimeMarker}\n      // The Games Hub route keeps its visual event bus in memory and independently\n      // rate-limits durable score writes, so every gameplay chat event can reach\n      // Emoji Rain, Dancing Parade, Word Storm, etc. without hammering the volume.\n      apiCall('/api/game-hub/chat', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({\n          channel: resolvedChannel,\n          userId: tags['user-id'] || '',\n          username: senderLogin,\n          displayName: tags['display-name'] || senderLogin,\n          message,\n          color: tags.color || '',\n          badges: tags.badges || {},\n        }),\n      }).catch(() => {});\n\n      // Chat Tag last-seen state is only a presence heartbeat. Keep the durable\n      // write throttled so active chatters cannot starve commands such as pack,\n      // mute, announcements, auto-join, or the periodic game loop.\n      if (shouldForwardChatActivity(senderUserId, resolvedChannel)) {\n        apiCall('/api/tag', {\n          method: 'POST',\n          headers: { 'Content-Type': 'application/json' },\n          body: JSON.stringify({\n            action: 'chat-activity',\n            userId: senderUserId,\n            twitchUsername: senderLogin,\n            channel: activityChannel\n          })\n        }).catch(() => {}); // fire and forget\n      }`;

  source = source.slice(0, start) + replacement + source.slice(blockEnd);
}

const dshForward = source.indexOf("forwardToDSH({ type: 'chat'");
const gameHubWrite = source.indexOf("apiCall('/api/game-hub/chat'", dshForward);
const throttle = source.indexOf('if (shouldForwardChatActivity(senderUserId, resolvedChannel))', gameHubWrite);
const tagWrite = source.indexOf("apiCall('/api/tag'", throttle);
if (
  dshForward < 0 ||
  gameHubWrite <= dshForward ||
  throttle <= gameHubWrite ||
  tagWrite <= throttle ||
  !source.includes("CHAT_ACTIVITY_THROTTLE_MS || '60000'")
) {
  throw new Error('Live chat pressure patch contract is incomplete.');
}

fs.writeFileSync(file, source, 'utf8');
console.log('Live chat pressure patch applied: realtime Games Hub events + 60s Chat Tag persistence heartbeat.');
