const assert = require('assert/strict');
const {
  normalizeChatHandle,
  resolvePlayerTarget,
  findTargetPlayer,
  findPlayerForDiscordUser,
} = require('../src/lib/chat-tag-player-lookup');

const players = [
  { id: 'user_1', twitchUsername: 'SpaceMountainLive', discordUsername: 'space_mountain', discordId: '111' },
  { id: 'user_2', twitchUsername: 'PinScorpion6521', discordUsername: 'pin', discordId: '222' },
  { id: 'user_3', twitchUsername: 'PinballWizard', discordUsername: 'pinball', discordId: '333' },
  { id: 'user_4', twitchUsername: 'kyouya66' },
];

assert.equal(normalizeChatHandle('@Space-Mountain!'), 'spacemountain');
assert.equal(resolvePlayerTarget(players, 'spacemountainlive').player.id, 'user_1');
assert.equal(resolvePlayerTarget(players, 'SpaceM').player.id, 'user_1');
assert.equal(resolvePlayerTarget(players, '<@222>').player.id, 'user_2');
assert.equal(resolvePlayerTarget(players, 'pin').player.id, 'user_2');
assert.equal(resolvePlayerTarget(players, 'pinb').player.id, 'user_3');
assert.equal(resolvePlayerTarget(players, 'pins').player.id, 'user_2');
assert.equal(resolvePlayerTarget(players, 'kyouya_66').player.id, 'user_4');
assert.equal(resolvePlayerTarget(players, '<@444>', [{ id: '444', username: 'kyouya_66' }]).player.id, 'user_4');
assert.equal(resolvePlayerTarget(players, 'zzzz').error, 'not-found');
assert.equal(findTargetPlayer(players, '<@!111>').id, 'user_1');
assert.equal(findPlayerForDiscordUser(players, '333', 'unknown').id, 'user_3');
assert.equal(findPlayerForDiscordUser(players, '', 'space_mountain').id, 'user_1');

console.log('chat-tag-player-lookup tests passed');
