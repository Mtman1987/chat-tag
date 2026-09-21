export type GameHubRuntimeKind =
  | 'native'
  | 'chat-reactive'
  | 'round-state'
  | 'board-state'
  | 'race-state';

export type GameHubStatus = 'live' | 'prototype-ready' | 'reconstructing';

export type GameHubCommand = {
  trigger: string;
  description: string;
  example?: string;
};

export type GameHubGame = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  howToPlay: string;
  runtime: GameHubRuntimeKind;
  status: GameHubStatus;
  category: 'core' | 'party' | 'creative' | 'word' | 'music' | 'race' | 'strategy';
  commands: GameHubCommand[];
  chatSignals?: string[];
  overlayAspect: 'full' | 'panel' | 'either';
  sourcePrototype?: string;
  nativePath?: string;
  nativeOverlayPath?: string;
};

export const GAME_HUB_CATALOG: GameHubGame[] = [
  {
    id: 'chat-tag',
    name: 'Chat Tag',
    shortName: 'Tag',
    description: 'The persistent cross-channel community tag game that started ChatTag.',
    howToPlay: 'Join once, then tag eligible community players from monitored Twitch chats. The current IT player, passes, immunity and FFA rules remain canonical.',
    runtime: 'native',
    status: 'live',
    category: 'core',
    commands: [
      { trigger: 'spmt join', description: 'Join Chat Tag.' },
      { trigger: 'spmt tag @user', description: 'Tag another player when eligible.' },
      { trigger: 'spmt pass @user', description: 'Use an earned pass for a double-points tag.' },
      { trigger: 'spmt score', description: 'Show your Chat Tag score and rank.' },
      { trigger: 'spmt status', description: 'Show who is IT or whether FFA is active.' },
    ],
    overlayAspect: 'either',
    nativePath: '/',
    nativeOverlayPath: '/overlay',
  },
  {
    id: 'quackverse',
    name: 'Quackverse',
    shortName: 'Quackverse',
    description: 'The existing room-scoped duck card battler, collection and pack game.',
    howToPlay: 'Players collect ducks, build a board and battle inside room-scoped Quackverse matches. Existing Quackverse state and APIs remain unchanged.',
    runtime: 'native',
    status: 'live',
    category: 'core',
    commands: [],
    overlayAspect: 'either',
    nativePath: '/quackverse',
    nativeOverlayPath: '/quackverse-overlay',
  },
  {
    id: 'chaosmode',
    name: 'Chaos Mode',
    shortName: 'Chaos',
    description: 'Every chat message raises the visual chaos level while special commands trigger screen effects.',
    howToPlay: 'Chat rapidly to increase chaos. Higher traffic creates more visual madness.',
    runtime: 'chat-reactive',
    status: 'prototype-ready',
    category: 'party',
    commands: [
      { trigger: '!explode', description: 'Trigger an explosion effect.' },
      { trigger: '!glitch', description: 'Trigger a glitch effect.' },
      { trigger: '!portal', description: 'Trigger a portal effect.' },
      { trigger: '!shake', description: 'Shake the scene.' },
    ],
    chatSignals: ['all chat activity'],
    overlayAspect: 'full',
    sourcePrototype: 'games/chaosmode.html',
  },
  {
    id: 'chatgarden',
    name: 'Chat Garden',
    shortName: 'Garden',
    description: 'Chat grows a shared garden from plant words found in messages.',
    howToPlay: 'Mention plant names such as flower, tree, rose or grass. Longer messages grow larger plants.',
    runtime: 'chat-reactive',
    status: 'prototype-ready',
    category: 'creative',
    commands: [],
    chatSignals: ['plant words', 'message length'],
    overlayAspect: 'either',
    sourcePrototype: 'games/chatgarden.html',
  },
  {
    id: 'chatwars',
    name: 'Chat Wars',
    shortName: 'Wars',
    description: 'Color teams turn meaningful conversation into a two-half territory match with levels and late-game tile steals.',
    howToPlay: 'Join red, blue, green or yellow, then talk normally. Up to five useful words score per message; longer words are worth more. Sustained play raises your level and multiplier while gradually requiring longer words. The first 20 by 25 field ends with Stella halftime, then a second field opens. From level 6 onward, messages gain an increasing chance to steal a tile from the leading opponent.',
    runtime: 'round-state',
    status: 'prototype-ready',
    category: 'strategy',
    commands: [
      { trigger: 'spmt red', description: 'Join the red team.' },
      { trigger: 'spmt blue', description: 'Join the blue team.' },
      { trigger: 'spmt green', description: 'Join the green team.' },
      { trigger: 'spmt yellow', description: 'Join the yellow team.' },
      { trigger: 'spmt wars view', description: 'Show both halves and the standings on the main overlay for 15 seconds.' },
    ],
    chatSignals: ['team member chat activity'],
    overlayAspect: 'full',
  },
  {
    id: 'chickenroyale',
    name: 'Chicken Royale',
    shortName: 'Chicken Royale',
    description: 'A chat-driven last-chicken-standing survival race with a shrinking storm.',
    howToPlay: 'Join as a chicken, then keep chatting while alive to boost movement and survive the storm. The last chicken standing wins.',
    runtime: 'race-state',
    status: 'prototype-ready',
    category: 'race',
    commands: [
      { trigger: '!join', description: 'Enter the next Chicken Royale.' },
      { trigger: '!start', description: 'Start the round early when allowed.' },
    ],
    chatSignals: ['alive player chat activity'],
    overlayAspect: 'full',
    sourcePrototype: 'games/chickenroyale.html',
  },
  {
    id: 'colorsymphony',
    name: 'Color Symphony',
    shortName: 'Symphony',
    description: 'Color words become musical notes and color combinations create harmony effects.',
    howToPlay: 'Type color names in normal chat. Recent compatible colors combine into harmony bursts.',
    runtime: 'chat-reactive',
    status: 'prototype-ready',
    category: 'music',
    commands: [],
    chatSignals: ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'white', 'black', 'cyan'],
    overlayAspect: 'either',
    sourcePrototype: 'games/colorsymphony.html',
  },
  {
    id: 'dancingparade',
    name: 'Dancing Parade',
    shortName: 'Parade',
    description: 'A raid or Dance Party redeem launches a full-screen community Cosmic Conga Line.',
    howToPlay: 'Use spmt join for your Twitch avatar, spmt plus emoji to grow the shared parade, and spmt dance to trigger the seismic wiggle.',
    runtime: 'chat-reactive',
    status: 'prototype-ready',
    category: 'party',
    commands: [
      { trigger: '!join', description: 'Join the parade.' },
      { trigger: '!dance', description: 'Trigger your dancer animation.' },
      { trigger: '!leave', description: 'Leave the parade.' },
    ],
    overlayAspect: 'either',
    sourcePrototype: 'games/dancingparade.html',
  },
  {
    id: 'emojirain',
    name: 'Emoji Rain',
    shortName: 'Emoji Rain',
    description: 'Every emoji posted in chat becomes a falling object in the overlay.',
    howToPlay: 'Send emojis. Multiple emojis create heavier rain and repeated emoji patterns create combo bursts.',
    runtime: 'chat-reactive',
    status: 'prototype-ready',
    category: 'party',
    commands: [],
    chatSignals: ['emoji content'],
    overlayAspect: 'either',
    sourcePrototype: 'games/emojirain.html',
  },
  {
    id: 'emojitower',
    name: 'Emoji Tower',
    shortName: 'Tower',
    description: 'The community stacks emoji blocks and tries to build the tallest stable tower.',
    howToPlay: 'Drop a block when your cooldown is ready. Poor placement can topple the shared tower and start a new run.',
    runtime: 'round-state',
    status: 'prototype-ready',
    category: 'party',
    commands: [
      { trigger: '!drop', description: 'Drop the next emoji block.' },
    ],
    overlayAspect: 'either',
    sourcePrototype: 'games/emojitower.html',
  },
  {
    id: 'petrace',
    name: 'Pet Race',
    shortName: 'Pet Race',
    description: 'Viewers enter pets in quick automatic races.',
    howToPlay: 'Join with a random pet or choose dog, cat, rabbit, turtle or hamster. A race starts automatically when enough racers enter.',
    runtime: 'race-state',
    status: 'prototype-ready',
    category: 'race',
    commands: [
      { trigger: '!join', description: 'Join with a random pet.' },
      { trigger: '!join dog', description: 'Join with a chosen pet type.', example: '!join cat' },
    ],
    overlayAspect: 'full',
    sourcePrototype: 'games/petrace.html',
  },
  {
    id: 'phraseguess',
    name: 'Phrase Guess',
    shortName: 'Phrase Guess',
    description: 'A masked phrase is gradually revealed while chat races to guess it.',
    howToPlay: 'Guess by typing the phrase in normal chat. Near matches can receive warm hints; the first exact solver wins the round.',
    runtime: 'round-state',
    status: 'prototype-ready',
    category: 'word',
    commands: [],
    chatSignals: ['all guesses'],
    overlayAspect: 'either',
    sourcePrototype: 'games/phraseguess.html',
  },
  {
    id: 'pixelbattle',
    name: 'Nebula Mosaic',
    shortName: 'Mosaic',
    description: 'Chat completes AI-generated color-coded artwork across four shared boards.',
    howToPlay: 'Request a theme with !mosaic owl, open one of four boards with spmt show 1, then paint naturally with commands such as spmt D12Y or spmt yellow D12. View remains an alias for show.',
    runtime: 'board-state',
    status: 'prototype-ready',
    category: 'creative',
    commands: [
      { trigger: '!mosaic owl', description: 'Request the next artwork theme free during testing.' },
      { trigger: 'spmt D12Y', description: 'Paint D12 yellow on the active board.' },
      { trigger: 'spmt show all', description: 'Show all four boards combined; view works too.' },
    ],
    overlayAspect: 'full',
    sourcePrototype: 'games/pixelbattle.html',
  },
  {
    id: 'rhythmpulse',
    name: 'Rhythm Pulse',
    shortName: 'Rhythm',
    description: 'Chat language and musical emojis generate beats, notes and synchronized combos.',
    howToPlay: 'Chat normally. Beat-like words, message intensity and musical emojis are translated into the live rhythm visualizer.',
    runtime: 'chat-reactive',
    status: 'prototype-ready',
    category: 'music',
    commands: [],
    chatSignals: ['beat words', 'musical emojis', 'message intensity'],
    overlayAspect: 'either',
    sourcePrototype: 'games/rhythmpulse.html',
  },
  {
    id: 'treasurehunt',
    name: 'Treasure Hunt',
    shortName: 'Treasure',
    description: 'A shared 20×25 riddle expedition where chat may collaborate—or misdirect each other—to steal high-value treasure solves.',
    howToPlay: 'Join the end of the turn rotation with spmt treasure. Normal turns last 90 seconds; warm, hot, and boiling riddle turns last five minutes. Choose A1 through T25 with spmt dig B5. Every choice opens a riddle. Cold digs resolve immediately, but warm, hot, and boiling digs stay locked until the active player solves it. Chat may help or deliberately misdirect them. Three wrong answers replace the riddle without moving the square. Three skipped turns removes a player until they rejoin. Joined players can vote-kick an absent player blocking a boiling turn. A fixed-price pass reveals one exact treasure coordinate, with five passes allowed per player per board.',
    runtime: 'board-state',
    status: 'prototype-ready',
    category: 'strategy',
    commands: [
      { trigger: 'spmt dig B5', description: 'Dig a coordinate on the treasure map.' },
      { trigger: 'spmt treasure answer piano', description: 'Answer the active riddle.' },
      { trigger: 'spmt treasure pass', description: 'Buy an exact-location pass for 250 Games Points.' },
    ],
    overlayAspect: 'either',
  },
  {
    id: 'wordchain',
    name: 'Word Chain',
    shortName: 'Word Chain',
    description: 'Players extend a shared word chain using the last letter of the previous word.',
    howToPlay: 'Type a valid word beginning with the previous word\'s final letter. Repeated words are rejected and long words can extend the timer.',
    runtime: 'round-state',
    status: 'prototype-ready',
    category: 'word',
    commands: [],
    chatSignals: ['plain alphabetic words'],
    overlayAspect: 'either',
    sourcePrototype: 'games/wordchain.html',
  },
  {
    id: 'wordstorm',
    name: 'Word Storm',
    shortName: 'Word Storm',
    description: 'Meaningful words from chat become a live storm whose size and combos reflect popularity.',
    howToPlay: 'Chat normally. Repeated and similar words grow, glow and combine into visual word storms.',
    runtime: 'chat-reactive',
    status: 'prototype-ready',
    category: 'word',
    commands: [],
    chatSignals: ['meaningful words', 'word frequency', 'word similarity'],
    overlayAspect: 'either',
    sourcePrototype: 'games/wordstorm.html',
  },
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

export function gameHubCommandSummary(game: GameHubGame): string {
  if (game.commands.length) return game.commands.map((command) => command.trigger).join(' · ');
  if (game.chatSignals?.length) return `Chat reactive: ${game.chatSignals.join(', ')}`;
  return 'Uses its native game controls';
}
