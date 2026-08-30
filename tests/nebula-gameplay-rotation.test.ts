import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GAME_HUB_CATALOG } from '../src/lib/game-hub-registry';
import { NEBULA_GAMEPLAY_ROTATION_MS, buildChatTagEmbed, nebulaGameplayImageUrl } from '../src/lib/chat-tag-discord';

test('showcase catalog exposes all 20 games for gameplay capture', () => {
  assert.equal(GAME_HUB_CATALOG.length, 20);
  assert.equal(new Set(GAME_HUB_CATALOG.map((game) => game.id)).size, 20);
});

test('DSH gameplay image URL changes only at ten-minute boundaries', () => {
  const start = 2 * NEBULA_GAMEPLAY_ROTATION_MS;
  assert.equal(nebulaGameplayImageUrl(start), nebulaGameplayImageUrl(start + NEBULA_GAMEPLAY_ROTATION_MS - 1));
  assert.notEqual(nebulaGameplayImageUrl(start), nebulaGameplayImageUrl(start + NEBULA_GAMEPLAY_ROTATION_MS));
});

test('Discord embed keeps player avatar as thumbnail and gameplay as main image', () => {
  const payload = buildChatTagEmbed({
    tag: { currentIt: { twitchUsername: 'Player', avatarUrl: 'https://example.com/player.png' }, playerCount: 1 },
    leaderboard: [], recentAnnouncements: [], recentHistory: [],
  }, 'https://chat-tag-new.fly.dev');
  const embed = payload.embeds[0];
  assert.equal(embed.thumbnail?.url, 'https://example.com/player.png');
  assert.match(embed.image?.url || '', /discord-stream-hub-new\.fly\.dev\/api\/nebula-arcade\/gameplay\/current\.gif\?slot=/);
});

test('bot refreshes the persistent embed on the ten-minute gameplay boundary', () => {
  const source = readFileSync(new URL('../bot.js', import.meta.url), 'utf8');
  assert.match(source, /scheduleNebulaGameplayEmbedRotation\(\)/);
  assert.match(source, /Nebula Arcade gameplay rotation/);
});
