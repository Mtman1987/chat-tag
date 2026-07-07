import assert from 'node:assert/strict';
import { parseDiscordChatPayload } from '../src/lib/discord-chat-payload';

const valid = parseDiscordChatPayload(JSON.stringify({
  userId: '123',
  guildId: '456',
  message: 'hello',
  userName: 'Tester',
  channelId: '789',
  messageId: '111',
}));

assert.equal(valid.message, 'hello');
assert.equal(valid.channelId, '789');

const withLiteralNewline = parseDiscordChatPayload('{"userId":"123","guildId":"456","message":"line one\nline two","userName":"Tester","channelId":"789","messageId":"111"}');
assert.equal(withLiteralNewline.message, 'line one\nline two');
assert.equal(withLiteralNewline.channelId, '789');

const withControlChar = parseDiscordChatPayload('{"userId":"123","guildId":"456","message":"line one\u0007 line two","userName":"Tester","channelId":"789","messageId":"111"}');
assert.equal(withControlChar.message, 'line one  line two');

console.log('discord chat payload parser tests passed');
