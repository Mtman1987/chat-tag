import {
  GAME_HUB_CATALOG as BASE_GAME_HUB_CATALOG,
  type GameHubGame,
} from '@/lib/game-hub-catalog';

export type { GameHubGame } from '@/lib/game-hub-catalog';

export const BINGO_GAME: GameHubGame = {
  id: 'bingo',
  name: 'Bingo',
  shortName: 'Bingo',
  description: 'Shared anti-cheat Stream Bingo driven by local speech transcription, chat claims, and Stella defense.',
  howToPlay: 'The player popout shows the shared phrase card while the stream overlay shows only coordinates. When the streamer says a phrase, claim its square before Stella protects it. Spend Games Points to change a phrase, spend more to flip a Stella square to chat, or buy center C3 as a chat-owned free space. Five chat-owned squares in a row wins.',
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

export function normalizeGameHubGameIds(input: unknown, max = 20): string[] {
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
