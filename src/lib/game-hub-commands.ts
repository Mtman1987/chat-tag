import type { GameHubGame } from '@/lib/game-hub-catalog';

export type CanonicalGameCommand = {
  trigger: string;
  description: string;
};

export type CanonicalGameCommandSpec = {
  gameId: string;
  key: string;
  aliases: string[];
  joinDescription: string;
  commands: CanonicalGameCommand[];
};

const SPECS: CanonicalGameCommandSpec[] = [
  { gameId: 'chat-tag', key: 'chattag', aliases: ['taggame'], joinDescription: 'Join Chat Tag.', commands: [
    { trigger: 'spmt chattag tag @user', description: 'Tag another Chat Tag player when eligible.' },
    { trigger: 'spmt chattag pass @user', description: 'Use an earned Chat Tag pass.' },
    { trigger: 'spmt chattag score', description: 'Show your Chat Tag score.' },
    { trigger: 'spmt chattag status', description: 'Show the current Chat Tag state.' },
  ] },
  { gameId: 'quackverse', key: 'quackverse', aliases: ['quack'], joinDescription: 'Join Quackverse.', commands: [] },
  { gameId: 'bingo', key: 'bingo', aliases: [], joinDescription: 'Join community Bingo.', commands: [
    { trigger: 'spmt bingo center your phrase here', description: 'Set your personal center-square phrase for the current Bingo card.' },
  ] },
  { gameId: 'chaosmode', key: 'chaos', aliases: ['chaosmode'], joinDescription: 'Join Chaos Mode.', commands: [
    { trigger: 'spmt chaos explode', description: 'Trigger an explosion effect.' },
    { trigger: 'spmt chaos glitch', description: 'Trigger a glitch effect.' },
    { trigger: 'spmt chaos portal', description: 'Trigger a portal effect.' },
    { trigger: 'spmt chaos shake', description: 'Shake the scene.' },
  ] },
  { gameId: 'chatgarden', key: 'garden', aliases: ['chatgarden'], joinDescription: 'Join Chat Garden; normal chat can grow plants while it is running.', commands: [] },
  { gameId: 'chatwars', key: 'chatwars', aliases: ['wars'], joinDescription: 'Join Chat Wars.', commands: [
    { trigger: 'spmt chatwars red', description: 'Join or fight for the red team.' },
    { trigger: 'spmt chatwars blue', description: 'Join or fight for the blue team.' },
    { trigger: 'spmt chatwars green', description: 'Join or fight for the green team.' },
    { trigger: 'spmt chatwars yellow', description: 'Join or fight for the yellow team.' },
  ] },
  { gameId: 'chickenroyale', key: 'chicken', aliases: ['chickenroyale', 'royale'], joinDescription: 'Enter Chicken Royale.', commands: [] },
  { gameId: 'colorsymphony', key: 'symphony', aliases: ['colorsymphony'], joinDescription: 'Join Color Symphony; color words in normal chat become notes.', commands: [] },
  { gameId: 'colorwars', key: 'colorwars', aliases: ['colors'], joinDescription: 'Join Color Wars.', commands: [
    { trigger: 'spmt colorwars red', description: 'Paint or fight for red.' },
    { trigger: 'spmt colorwars blue', description: 'Paint or fight for blue.' },
    { trigger: 'spmt colorwars green', description: 'Paint or fight for green.' },
    { trigger: 'spmt colorwars yellow', description: 'Paint or fight for yellow.' },
  ] },
  { gameId: 'dancingparade', key: 'parade', aliases: ['dancingparade'], joinDescription: 'Join the Dancing Parade.', commands: [
    { trigger: 'spmt parade dance', description: 'Trigger your dancer animation.' },
  ] },
  { gameId: 'emojirain', key: 'rain', aliases: ['emojirain'], joinDescription: 'Join Emoji Rain; emojis in normal chat become falling objects.', commands: [] },
  { gameId: 'emojitower', key: 'tower', aliases: ['emojitower'], joinDescription: 'Join Emoji Tower.', commands: [
    { trigger: 'spmt tower drop', description: 'Drop the next tower block.' },
  ] },
  { gameId: 'memorylane', key: 'memory', aliases: ['memorylane'], joinDescription: 'Join Memory Lane; story-like chat becomes memory cards.', commands: [] },
  { gameId: 'petrace', key: 'petrace', aliases: ['pets'], joinDescription: 'Enter Pet Race with a random pet.', commands: [
    { trigger: 'spmt petrace dog', description: 'Enter as a dog.' },
    { trigger: 'spmt petrace cat', description: 'Enter as a cat.' },
    { trigger: 'spmt petrace rabbit', description: 'Enter as a rabbit.' },
    { trigger: 'spmt petrace turtle', description: 'Enter as a turtle.' },
    { trigger: 'spmt petrace hamster', description: 'Enter as a hamster.' },
  ] },
  { gameId: 'phraseguess', key: 'phrase', aliases: ['phraseguess'], joinDescription: 'Join Phrase Guess; guesses are made in normal chat.', commands: [] },
  { gameId: 'pixelbattle', key: 'pixel', aliases: ['pixelbattle'], joinDescription: 'Join Pixel Battle.', commands: [
    { trigger: 'spmt pixel red 10 5', description: 'Paint a pixel using color, X and Y.' },
  ] },
  { gameId: 'rhythmpulse', key: 'rhythm', aliases: ['rhythmpulse'], joinDescription: 'Join Rhythm Pulse; normal chat feeds the beat.', commands: [] },
  { gameId: 'treasurehunt', key: 'treasure', aliases: ['treasurehunt'], joinDescription: 'Join Treasure Hunt.', commands: [
    { trigger: 'spmt treasure B5', description: 'Dig a coordinate on the treasure map.' },
  ] },
  { gameId: 'wordchain', key: 'wordchain', aliases: ['chain'], joinDescription: 'Join Word Chain; valid words are entered in normal chat.', commands: [] },
  { gameId: 'wordstorm', key: 'wordstorm', aliases: ['storm'], joinDescription: 'Join Word Storm; normal chat builds the storm.', commands: [] },
];

const BY_GAME = new Map(SPECS.map((spec) => [spec.gameId, spec]));
const BY_KEY = new Map<string, CanonicalGameCommandSpec>();
for (const spec of SPECS) {
  BY_KEY.set(spec.key, spec);
  for (const alias of spec.aliases) BY_KEY.set(alias, spec);
}

export function getCanonicalGameCommandSpec(gameOrId: GameHubGame | string | null | undefined): CanonicalGameCommandSpec | null {
  const id = typeof gameOrId === 'string' ? gameOrId : gameOrId?.id;
  return BY_GAME.get(String(id || '').trim().toLowerCase()) || null;
}

export function resolveGameHubCommandKey(value: unknown): CanonicalGameCommandSpec | null {
  return BY_KEY.get(String(value || '').trim().toLowerCase()) || null;
}

export function canonicalJoinCommand(gameOrId: GameHubGame | string): string {
  const spec = getCanonicalGameCommandSpec(gameOrId);
  return spec ? `spmt ${spec.key}` : '';
}

export function canonicalStreamerCommands(gameOrId: GameHubGame | string): CanonicalGameCommand[] {
  const spec = getCanonicalGameCommandSpec(gameOrId);
  if (!spec) return [];
  return [
    { trigger: `spmt ${spec.key} start`, description: 'Streamer/mod: start this game in the current channel.' },
    { trigger: `spmt ${spec.key} stop`, description: 'Streamer/mod: stop this game in the current channel.' },
  ];
}

export function canonicalPlayerCommands(gameOrId: GameHubGame | string): CanonicalGameCommand[] {
  const spec = getCanonicalGameCommandSpec(gameOrId);
  if (!spec) return [];
  return [
    { trigger: `spmt ${spec.key}`, description: spec.joinDescription },
    ...spec.commands,
    { trigger: `spmt ${spec.key} leave`, description: `Leave ${spec.key}.` },
  ];
}

export function canonicalCommandSummary(gameOrId: GameHubGame | string): string {
  const commands = canonicalPlayerCommands(gameOrId);
  return commands.map((command) => command.trigger).join(' · ');
}

export const GAME_HUB_COMMAND_SPECS = SPECS;
