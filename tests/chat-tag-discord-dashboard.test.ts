import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NEBULA_ARCADE_EMBED_REVISION,
  buildChatTagEmbed,
  buildGameStatePayload,
  shouldReplacePersistentChatTagEmbed,
} from '../src/lib/chat-tag-discord';

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

test('permanent dashboard uses three explicit two-column rows', () => {
  const gameState = buildGameStatePayload(testState());
  const payload = buildChatTagEmbed(gameState, 'https://arcade.example');
  const fields = payload.embeds[0].fields;

  assert.equal(gameState.recentAnnouncements.length, 3);
  assert.deepEqual(
    fields.filter((field) => field.inline).map((field) => field.name),
    ['🎯 Current Tag', '🏆 Top 3', '📜 Recent Tags', '📣 Latest · 🎯 New Tag', '📢 🎲 Automatic Rotation', '🗂️ 🔥 Double-Points Tag'],
  );
  assert.equal(fields.filter((field) => !field.inline).length, 2);
  assert.match(fields[4].value, /mamafeisty.*robdparry/);
  assert.match(fields[6].name, /Automatic Rotation/);
  assert.doesNotMatch(JSON.stringify(fields), /This should not be displayed/);
  assert.doesNotMatch(JSON.stringify(fields), /Add to OBS|tinyurl\.com\/spmt-overlay/);
});

test('current tagged duration uses a live Discord relative timestamp', () => {
  const gameState = buildGameStatePayload(testState());
  const payload = buildChatTagEmbed(gameState, 'https://arcade.example');
  const currentTag = payload.embeds[0].fields[0].value;
  const expectedUnix = Math.floor(Number(gameState.tag.lastTagTime) / 1000);

  assert.match(currentTag, /robdparry is IT/);
  assert.match(currentTag, new RegExp(`<t:${expectedUnix}:R>`));
  assert.doesNotMatch(currentTag, /0 min/);
  assert.equal((payload.embeds[0] as any).thumbnail, undefined);
});

test('legacy persistent message is replaced once so Discord accepts the new webhook author', () => {
  assert.equal(shouldReplacePersistentChatTagEmbed({ messageId: 'old', via: 'webhook' }), true);
  assert.equal(shouldReplacePersistentChatTagEmbed({ messageId: 'new', embedRevision: NEBULA_ARCADE_EMBED_REVISION }), false);
  assert.equal(shouldReplacePersistentChatTagEmbed(null), false);
});

test('dashboard links and brands the animated 20-game Nebula Arcade showcase', () => {
  const payload = buildChatTagEmbed(buildGameStatePayload(testState()), 'https://arcade.example/base');
  const embed = payload.embeds[0];

  assert.equal(embed.title, '🎮 Nebula Arcade · Chat Tag Live');
  assert.equal(embed.url, 'https://arcade.example/games');
  assert.equal(embed.author.name, 'Nebula Arcade · 20 Games');
  assert.equal(embed.author.icon_url, 'https://arcade.example/brand/chat-tag-icon-512.png');
  assert.equal(embed.image?.url, 'https://arcade.example/brand/nebula-arcade-games-showcase.gif?v=2');
  assert.equal(payload.components[0].components[0].label, 'Open all 20 games');
  assert.equal(payload.components[0].components[0].url, 'https://arcade.example/games');
});

test('recent tag events backfill the announcement section before new announcements accumulate', () => {
  const state = testState();
  state.discordMessages.announcements = [];
  const gameState = buildGameStatePayload(state);

  assert.equal(gameState.recentAnnouncements.length, 1);
  assert.match(gameState.recentAnnouncements[0].title, /New Tag/);
  assert.match(gameState.recentAnnouncements[0].description, /mamafeisty.*robdparry/);
});
