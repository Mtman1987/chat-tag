import {
  GAME_HUB_CATALOG as BASE_GAME_HUB_CATALOG,
  type GameHubGame,
} from '@/lib/game-hub-catalog';

export type { GameHubGame } from '@/lib/game-hub-catalog';

export const BINGO_GAME: GameHubGame = {
  id: 'bingo',
  name: 'Bingo',
  shortName: 'Bingo',
  description: 'Community Bingo with a shared outer board and a personal center phrase for every player.',
  howToPlay: 'Join Bingo, choose your own center phrase, then watch participating community streams. The outer 24 phrases are shared, but your center phrase and claimed squares belong to your card. Claim at most one square from each streamer; completing a row, column, or diagonal including your personal center wins the card.',
  runtime: 'native',
  status: 'live',
  category: 'party',
  commands: [],
  chatSignals: ['community stream moments'],
  overlayAspect: 'either',
  nativePath: '/bingo',
};

export const GAME_HUB_CATALOG: GameHubGame[] = [
  ...BASE_GAME_HUB_CATALOG,
  BINGO_GAME,
];

const GAME_BY_ID = new Map(GAME_HUB_CATALOG.map((game) => [game.id, game]));

export function getGameHubGame(gameId: string | null | undefined): GameHubGame | null {
  return GAME_BY_ID.get(String(gameId || '').trim().toLowerCase()) || null;
}

export function normalizeGameHubGameIds(input: unknown, max = 8): string[] {
  const values = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const id = String(value || '').trim().toLowerCase();
    if (!GAME_BY_ID.has(id) || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
    if (output.length >= max) break;
  }
  return output;
}
