import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChatTagEmbed, buildGameStatePayload } from '../src/lib/chat-tag-discord';

function testState() {
  const taggedAt = Date.now() - 17 * 60 * 1000;
  return {
    users: {},
    tagPlayers: {
      winner: {
        id: 'winner',
        twitchUsername: 'robdparry',
        avatarUrl: 'https://example.com/avatar.png',
        isIt: true,
      },
      tagger: {
        id: 'tagger',
        twitchUsername: 'mamafeisty',
      },
    },
    tagHistory: [
      {
        taggerId: 'tagger',
        taggedId: 'winner',
        timestamp: taggedAt,
      },
    ],
    adminHistory: [],
    tagGame: { state: { currentIt: 'winner', lastTagTime: taggedAt } },
    bingoCards: {},
    bingoEvents: [],
    chatTags: [],
    botChannels: {},
    botSettings: {
      mutedChannels: { channels: [] },
      blacklistedChannels: { channels: [] },
    },
    discordWebhooks: {},
    discordMessages: {
      announcements: [
        {
          id: 'latest',
          title: '🎯 New Tag',
          description: '**mamafeisty** tagged **robdparry**.',
          details: ['**Now IT:** robdparry', '**Players:** 2'],
          timestamp: new Date(taggedAt + 2000).toISOString(),
        },
        {
          id: 'previous',
          title: '🎲 Automatic Rotation',
          description: 'The system selected **mamafeisty**.',
          details: ['**Now IT:** mamafeisty'],
          timestamp: new Date(taggedAt + 1000).toISOString(),
        },
        {
          id: 'oldest',
          title: '🔥 Double-Points Tag',
          description: '**robdparry** tagged **mamafeisty** for double points.',
          details: [],
          timestamp: new Date(taggedAt).toISOString(),
        },
        {
          id: 'not-shown',
          title: 'Older Update',
          description: 'This should not be displayed.',
          timestamp: new Date(taggedAt - 1000).toISOString(),
        },
      ],
    },
    settings: {},
    gameSettings: { default: {} },
    pinTags: { pinscorpion6521: { counts: {} } },
    overlayMessages: {},
    modLog: [],
    quackverseRooms: {},
    quackverse: {},
    quackversePackOpens: [],
    botRuntime: { joinedChannels: [], firstLiveAnnouncementByChannel: {} },
  } as any;
}

test('permanent dashboard shows the latest three announcements first', () => {
  const gameState = buildGameStatePayload(testState());
  const payload = buildChatTagEmbed(gameState);
  const fields = payload.embeds[0].fields;

  assert.equal(gameState.recentAnnouncements.length, 3);
  assert.match(fields[0].name, /LATEST ANNOUNCEMENT/);
  assert.match(fields[0].value, /mamafeisty.*robdparry/);
  assert.match(fields[1].name, /Automatic Rotation/);
  assert.doesNotMatch(JSON.stringify(fields), /This should not be displayed/);
  assert.doesNotMatch(JSON.stringify(fields), /Add to OBS|tinyurl\.com\/spmt-overlay/);
});

test('current tagged duration uses a live Discord relative timestamp', () => {
  const gameState = buildGameStatePayload(testState());
  const payload = buildChatTagEmbed(gameState);
  const description = payload.embeds[0].description;
  const expectedUnix = Math.floor(Number(gameState.tag.lastTagTime) / 1000);

  assert.match(description, /robdparry is IT/);
  assert.match(description, new RegExp(`<t:${expectedUnix}:R>`));
  assert.doesNotMatch(description, /0 min/);
  assert.equal(payload.embeds[0].thumbnail?.url, 'https://example.com/avatar.png');
});

test('recent tag events backfill the announcement section before new announcements accumulate', () => {
  const state = testState();
  state.discordMessages.announcements = [];
  const gameState = buildGameStatePayload(state);

  assert.equal(gameState.recentAnnouncements.length, 1);
  assert.match(gameState.recentAnnouncements[0].title, /New Tag/);
  assert.match(gameState.recentAnnouncements[0].description, /mamafeisty.*robdparry/);
});
