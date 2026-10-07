import { createHash } from 'node:crypto';
import { getGameHubGame } from '@/lib/game-hub-catalog';
import { canonicalPlayerCommands } from '@/lib/game-hub-commands';
import { getGameHubGameStats, resolveChannelGameIds, wordChainPublicSnapshot, phraseGuessPublicSnapshot } from '@/lib/game-hub-state';
import { mosaicPublicSnapshot } from '@/lib/nebula-mosaic';
import { getPublicAppOrigin } from '@/lib/public-origin';

const clean = (value: unknown, limit = 900) => String(value ?? '').replace(/([\\`*_~|>])/g, '\\$1').slice(0, limit);
export function buildGameDiscordCard(stateValue: any, channel: string, gameId: string) {
  const game = getGameHubGame(gameId);
  if (!game) throw new Error('Unknown game.');
  // Snapshot helpers may initialize defaults; public cards never persist them.
  const state = structuredClone(stateValue);
  const origin = getPublicAppOrigin();
  const url = `${origin}/overlay/game-hub/instant.${channel}.${gameId}`;
  const running = resolveChannelGameIds(state, channel).includes(gameId);
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  let image: { url: string } | undefined;
  if (gameId === 'pixelbattle') {
    const art = mosaicPublicSnapshot(state, channel).artwork;
    if (art) {
      fields.push({ name: `${clean(art.theme, 180)} · Board ${art.activeBoard}`, value: `${art.progress}/${art.total} correct (${Math.round(art.progress / Math.max(1, art.total) * 100)}%) · ${clean(art.status)}` });
      const version = createHash('sha256').update(JSON.stringify([art.id, art.activeBoard, art.target, art.painted, art.paletteId])).digest('hex').slice(0, 16);
      image = { url: `${origin}/api/overlay/game-hub/mosaic-card?channel=${encodeURIComponent(channel)}&artworkId=${encodeURIComponent(art.id)}&v=${version}` };
    }
  } else if (gameId === 'wordchain' && running) {
    const round = wordChainPublicSnapshot(state, channel);
    fields.push({ name: `Round ${round.roundNumber} · ${round.phase}`, value: `Theme: ${clean(round.theme)}\nCurrent word: **${clean(round.currentWord)}** · Next letter: **${clean(round.requiredLetter).toUpperCase()}**\nChain: ${round.chainLength} words` });
    if (round.wordAppeal) fields.push({ name: `Allow “${clean(round.wordAppeal.word, 100)}”?`, value: `Vote spmt yes or spmt no in Twitch chat. Yes: ${round.wordAppeal.yes} · No: ${round.wordAppeal.no}` });
    if (round.lastTally?.leaders?.length) fields.push({ name: 'Last round results', value: round.lastTally.leaders.slice(0, 10).map((entry: any) => `${clean(entry.displayName, 60)}: ${entry.points} pts`).join('\n').slice(0, 1000) });
    if (round.gameWinners?.length) fields.push({ name: 'Game winner', value: round.gameWinners.map(entry => `${clean(entry.displayName, 60)} (${entry.points} pts)`).join(', ').slice(0, 1000) });
  } else if (gameId === 'phraseguess' && running) {
    const round = phraseGuessPublicSnapshot(state, channel);
    fields.push({ name: round.solved ? 'Solved!' : 'Guess the phrase', value: clean(round.maskedPhrase) || 'Waiting for a phrase.' });
  }
  const leaders = getGameHubGameStats(state, gameId).leaderboard.slice(0, 3);
  if (leaders.length) fields.push({ name: 'Overall top 3', value: leaders.map((entry, index) => `${index + 1}. ${clean(entry.displayName || entry.username, 60)}: ${entry.score} pts`).join('\n') });
  const commands = canonicalPlayerCommands(game).slice(0, 3);
  if (commands.length) fields.push({ name: 'Play in Twitch chat', value: commands.map(command => `\`${command.trigger.slice(0, 150)}\` — ${clean(command.description, 100)}`).join('\n').slice(0, 1000) });
  return {
    username: 'Nebula Arcade', allowed_mentions: { parse: [] },
    embeds: [{ title: `${game.name} · #${channel}`, url, color: running ? 0x22d3ee : 0x64748b,
      description: `**${running ? 'Live' : 'Waiting to start'}**\n${clean(game.howToPlay, 550)}\n\n[Watch the game](${url}) · [Play in Twitch chat](https://twitch.tv/${channel})`,
      fields, ...(image ? { image } : {}), footer: { text: 'Updates about every 30 seconds · One card per game' } }],
  };
}
