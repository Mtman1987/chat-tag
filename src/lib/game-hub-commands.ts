import type { GameHubGame } from '@/lib/game-hub-catalog';

export type CanonicalGameCommand = { trigger: string; description: string };

export type CanonicalGameCommandSpec = {
  gameId: string;
  key: string;
  aliases: string[];
  joinDescription: string;
  joinTrigger: string;
  leaveTrigger?: string;
  commands: CanonicalGameCommand[];
};

export type DirectGameCommandIntent = { gameId: string; actionArgs: string[]; command: string };
export type DirectGameCommandResolution = {
  recognized: boolean;
  mode: 'single' | 'choose' | 'broadcast';
  intents: DirectGameCommandIntent[];
};

const SPECS: CanonicalGameCommandSpec[] = [
  { gameId: 'chat-tag', key: 'chattag', aliases: ['taggame'], joinDescription: 'Join Chat Tag.', joinTrigger: 'spmt join', leaveTrigger: 'spmt leave', commands: [
    { trigger: 'spmt tag @user', description: 'Tag another Chat Tag player when eligible.' },
    { trigger: 'spmt pass @user', description: 'Use an earned Chat Tag pass.' },
    { trigger: 'spmt score', description: 'Show your Chat Tag score.' },
    { trigger: 'spmt status', description: 'Show the current Chat Tag state.' },
  ] },
  { gameId: 'quackverse', key: 'quackverse', aliases: ['quack'], joinDescription: 'Open a Quackverse pack.', joinTrigger: 'spmt pack', commands: [
    { trigger: 'spmt quackpack', description: 'Open a Quackverse pack.' },
  ] },
  { gameId: 'bingo', key: 'bingo', aliases: [], joinDescription: 'Open your Bingo card.', joinTrigger: 'spmt card', commands: [
    { trigger: 'spmt claim 12', description: 'Claim a Bingo square.' },
    { trigger: 'spmt phrases', description: 'Show the current Bingo phrases.' },
  ] },
  { gameId: 'chaosmode', key: 'chaos', aliases: ['chaosmode'], joinDescription: 'Join Chaos Mode.', joinTrigger: 'spmt chaos', commands: [
    { trigger: 'spmt explode', description: 'Trigger an explosion effect.' },
    { trigger: 'spmt glitch', description: 'Trigger a glitch effect.' },
    { trigger: 'spmt portal', description: 'Trigger a portal effect.' },
    { trigger: 'spmt shake', description: 'Shake the scene.' },
  ] },
  { gameId: 'chatgarden', key: 'garden', aliases: ['chatgarden'], joinDescription: 'Join Chat Garden; normal chat grows plants.', joinTrigger: 'spmt garden', commands: [
    { trigger: 'spmt grow', description: 'Join the shared garden.' },
  ] },
  { gameId: 'chatwars', key: 'chatwars', aliases: ['wars'], joinDescription: 'Join Chat Wars.', joinTrigger: 'spmt wars', commands: [
    { trigger: 'spmt red', description: 'Join or fight for red.' },
    { trigger: 'spmt blue', description: 'Join or fight for blue.' },
    { trigger: 'spmt green', description: 'Join or fight for green.' },
    { trigger: 'spmt yellow', description: 'Join or fight for yellow.' },
  ] },
  { gameId: 'chickenroyale', key: 'chicken', aliases: ['chickenroyale', 'royale'], joinDescription: 'Enter Chicken Royale.', joinTrigger: 'spmt chicken', commands: [
    { trigger: 'spmt hatch', description: 'Enter Chicken Royale.' },
    { trigger: 'spmt launch', description: 'Streamer/mod: launch the round.' },
  ] },
  { gameId: 'colorsymphony', key: 'symphony', aliases: ['colorsymphony'], joinDescription: 'Join Color Symphony.', joinTrigger: 'spmt symphony', commands: [
    { trigger: 'spmt harmony', description: 'Join the shared symphony.' },
  ] },
  { gameId: 'colorwars', key: 'colorwars', aliases: ['colors'], joinDescription: 'Join Color Wars.', joinTrigger: 'spmt colors', commands: [
    { trigger: 'spmt red', description: 'Paint for red.' },
    { trigger: 'spmt blue', description: 'Paint for blue.' },
    { trigger: 'spmt green', description: 'Paint for green.' },
    { trigger: 'spmt yellow', description: 'Paint for yellow.' },
  ] },
  { gameId: 'dancingparade', key: 'parade', aliases: ['dancingparade'], joinDescription: 'Join Dancing Parade.', joinTrigger: 'spmt parade', commands: [
    { trigger: 'spmt dance', description: 'Trigger your dancer animation.' },
  ] },
  { gameId: 'emojirain', key: 'rain', aliases: ['emojirain'], joinDescription: 'Join Emoji Rain.', joinTrigger: 'spmt rain', commands: [] },
  { gameId: 'emojitower', key: 'tower', aliases: ['emojitower'], joinDescription: 'Join Emoji Tower.', joinTrigger: 'spmt tower', commands: [
    { trigger: 'spmt drop', description: 'Drop the next tower block.' },
  ] },
  { gameId: 'memorylane', key: 'memory', aliases: ['memorylane'], joinDescription: 'Join Memory Lane.', joinTrigger: 'spmt memory', commands: [] },
  { gameId: 'petrace', key: 'petrace', aliases: ['pets'], joinDescription: 'Enter Pet Race.', joinTrigger: 'spmt pet', commands: [
    { trigger: 'spmt pet dog', description: 'Enter as a dog.' },
    { trigger: 'spmt pet cat', description: 'Enter as a cat.' },
    { trigger: 'spmt pet rabbit', description: 'Enter as a rabbit.' },
    { trigger: 'spmt pet turtle', description: 'Enter as a turtle.' },
    { trigger: 'spmt pet hamster', description: 'Enter as a hamster.' },
  ] },
  { gameId: 'phraseguess', key: 'phrase', aliases: ['phraseguess'], joinDescription: 'Join Phrase Guess.', joinTrigger: 'spmt phrase', commands: [] },
  { gameId: 'pixelbattle', key: 'pixel', aliases: ['pixelbattle'], joinDescription: 'Join Pixel Battle.', joinTrigger: 'spmt pixel', commands: [
    { trigger: 'spmt paint red 10 5', description: 'Paint a pixel using color, X and Y.' },
  ] },
  { gameId: 'rhythmpulse', key: 'rhythm', aliases: ['rhythmpulse'], joinDescription: 'Join Rhythm Pulse.', joinTrigger: 'spmt rhythm', commands: [] },
  { gameId: 'treasurehunt', key: 'treasure', aliases: ['treasurehunt'], joinDescription: 'Join Treasure Hunt.', joinTrigger: 'spmt treasure', commands: [
    { trigger: 'spmt dig B5', description: 'Dig a coordinate on the treasure map.' },
  ] },
  { gameId: 'wordchain', key: 'wordchain', aliases: ['chain'], joinDescription: 'Join Word Chain.', joinTrigger: 'spmt chain', commands: [] },
  { gameId: 'wordstorm', key: 'wordstorm', aliases: ['storm'], joinDescription: 'Join Word Storm.', joinTrigger: 'spmt storm', commands: [] },
];

const BY_GAME = new Map(SPECS.map((spec) => [spec.gameId, spec]));
const BY_KEY = new Map<string, CanonicalGameCommandSpec>();
for (const spec of SPECS) {
  BY_KEY.set(spec.key, spec);
  for (const alias of spec.aliases) BY_KEY.set(alias, spec);
}

function intent(gameId: string, actionArgs: string[]): DirectGameCommandIntent {
  const spec = BY_GAME.get(gameId)!;
  return { gameId, actionArgs, command: `spmt ${spec.key}${actionArgs.length ? ` ${actionArgs.join(' ')}` : ''}` };
}

export function getCanonicalGameCommandSpec(gameOrId: GameHubGame | string | null | undefined): CanonicalGameCommandSpec | null {
  const id = typeof gameOrId === 'string' ? gameOrId : gameOrId?.id;
  return BY_GAME.get(String(id || '').trim().toLowerCase()) || null;
}

export function resolveGameHubCommandKey(value: unknown): CanonicalGameCommandSpec | null {
  return BY_KEY.get(String(value || '').trim().toLowerCase()) || null;
}

export function resolveDirectGameCommand(partsValue: string[], activeGameIdsValue: string[]): DirectGameCommandResolution {
  const parts = partsValue.map((part) => String(part || '').trim().toLowerCase()).filter(Boolean);
  const root = parts[0] || '';
  const rest = parts.slice(1);
  const active = new Set(activeGameIdsValue.map((gameId) => String(gameId || '').trim().toLowerCase()));
  const activeIntent = (gameId: string, actionArgs: string[]) => active.has(gameId) ? [intent(gameId, actionArgs)] : [];

  // A key followed by arguments is already the internal compatibility form
  // (for example `spmt chicken start`). Leave it untouched for the existing
  // controller below. A bare key remains a public short join command.
  if (rest.length && BY_KEY.has(root)) {
    return { recognized: false, mode: 'single', intents: [] };
  }

  if (root === 'join' || root === 'leave') {
    const actionArgs = root === 'leave' ? ['leave'] : [];
    const intents = [intent('chat-tag', actionArgs), ...[...active]
      .filter((gameId) => gameId !== 'chat-tag' && BY_GAME.has(gameId))
      .map((gameId) => intent(gameId, actionArgs))];
    return { recognized: true, mode: intents.length > 1 ? 'choose' : 'single', intents };
  }

  if (root === 'start') {
    const intents = SPECS.filter((spec) => spec.gameId !== 'chat-tag').map((spec) => intent(spec.gameId, ['start']));
    return { recognized: true, mode: 'choose', intents };
  }

  if (root === 'stop') {
    const intents = [...active]
      .filter((gameId) => gameId !== 'chat-tag' && BY_GAME.has(gameId))
      .map((gameId) => intent(gameId, ['stop']));
    return { recognized: true, mode: intents.length > 1 ? 'choose' : 'single', intents };
  }

  if (/^(red|blue|green|yellow)$/.test(root)) {
    const intents = ['chatwars', 'colorwars'].flatMap((gameId) => activeIntent(gameId, [root]));
    return { recognized: true, mode: intents.length > 1 ? 'broadcast' : 'single', intents };
  }

  const direct: Record<string, [string, string[]]> = {
    card: ['bingo', []],
    chaos: ['chaosmode', []], explode: ['chaosmode', ['explode']], glitch: ['chaosmode', ['glitch']], portal: ['chaosmode', ['portal']], shake: ['chaosmode', ['shake']],
    garden: ['chatgarden', []], grow: ['chatgarden', []], wars: ['chatwars', []],
    chicken: ['chickenroyale', []], royale: ['chickenroyale', []], hatch: ['chickenroyale', []], launch: ['chickenroyale', ['start']],
    symphony: ['colorsymphony', []], harmony: ['colorsymphony', []], colors: ['colorwars', []],
    parade: ['dancingparade', []], dance: ['dancingparade', ['dance']], rain: ['emojirain', []],
    tower: ['emojitower', []], drop: ['emojitower', ['drop']], memory: ['memorylane', []],
    phrase: ['phraseguess', []], pixel: ['pixelbattle', []], rhythm: ['rhythmpulse', []],
    treasure: ['treasurehunt', []], chain: ['wordchain', []], storm: ['wordstorm', []],
  };

  if (root === 'pet' || root === 'race') {
    const pet = /^(dog|cat|rabbit|turtle|hamster)$/.test(rest[0] || '') ? [rest[0]] : [];
    return { recognized: true, mode: 'single', intents: activeIntent('petrace', pet) };
  }
  if (root === 'claim') return { recognized: true, mode: 'single', intents: activeIntent('bingo', ['claim', ...rest]) };
  if (root === 'phrases') return { recognized: true, mode: 'single', intents: activeIntent('bingo', ['phrases']) };
  if (root === 'paint') return { recognized: true, mode: 'single', intents: activeIntent('pixelbattle', rest) };
  if (root === 'dig') return { recognized: true, mode: 'single', intents: activeIntent('treasurehunt', rest) };
  const match = direct[root];
  if (!match) return { recognized: false, mode: 'single', intents: [] };
  return { recognized: true, mode: 'single', intents: activeIntent(match[0], match[1]) };
}

export function canonicalJoinCommand(gameOrId: GameHubGame | string): string {
  return getCanonicalGameCommandSpec(gameOrId)?.joinTrigger || '';
}

export function canonicalStreamerCommands(gameOrId: GameHubGame | string): CanonicalGameCommand[] {
  const spec = getCanonicalGameCommandSpec(gameOrId);
  if (!spec || spec.gameId === 'chat-tag') return [];
  return [
    { trigger: 'spmt start', description: 'Streamer/mod: choose a game to start.' },
    { trigger: 'spmt stop', description: 'Streamer/mod: choose an active game to stop.' },
  ];
}

export function canonicalPlayerCommands(gameOrId: GameHubGame | string): CanonicalGameCommand[] {
  const spec = getCanonicalGameCommandSpec(gameOrId);
  if (!spec) return [];
  return [
    { trigger: spec.joinTrigger, description: spec.joinDescription },
    ...spec.commands,
    { trigger: spec.leaveTrigger || 'spmt leave', description: `Leave ${spec.gameId}; Nebula asks which game when needed.` },
  ];
}

export function canonicalCommandSummary(gameOrId: GameHubGame | string): string {
  return canonicalPlayerCommands(gameOrId).map((command) => command.trigger).join(' · ');
}

export const GAME_HUB_COMMAND_SPECS = SPECS;
