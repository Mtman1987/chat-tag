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
    description: 'Viewers join color teams and ordinary chat activity pushes territorial control.',
    howToPlay: 'Join red, blue, green or yellow. Every later chat message helps your team capture territory; first to the configured control target wins.',
    runtime: 'round-state',
    status: 'prototype-ready',
    category: 'strategy',
    commands: [
      { trigger: '!red', description: 'Join the red team.' },
      { trigger: '!blue', description: 'Join the blue team.' },
      { trigger: '!green', description: 'Join the green team.' },
      { trigger: '!yellow', description: 'Join the yellow team.' },
    ],
    chatSignals: ['team member chat activity'],
    overlayAspect: 'full',
    sourcePrototype: 'games/chatwars.html',
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
    id: 'colorwars',
    name: 'Color Wars',
    shortName: 'Color Wars',
    description: 'Color teams compete to paint the largest share of a shared board.',
    howToPlay: 'Use a color command to paint for that team. Rounds score area control and can trigger splash, bomb and chaos effects.',
    runtime: 'board-state',
    status: 'prototype-ready',
    category: 'strategy',
    commands: [
      { trigger: '!red', description: 'Paint for red.' },
      { trigger: '!blue', description: 'Paint for blue.' },
      { trigger: '!green', description: 'Paint for green.' },
      { trigger: '!yellow', description: 'Paint for yellow.' },
    ],
    overlayAspect: 'full',
    sourcePrototype: 'games/colorwars.html',
  },
  {
    id: 'dancingparade',
    name: 'Dancing Parade',
    shortName: 'Parade',
    description: 'Chatters become dancers in a shared on-screen parade.',
    howToPlay: 'Join the parade, dance through chat activity, and leave whenever you want.',
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
    id: 'memorylane',
    name: 'Memory Lane',
    shortName: 'Memory Lane',
    description: 'Stories and emoji themes become drifting photo-memory cards.',
    howToPlay: 'Share a memory or story in chat. Emoji and message content influence the generated photo-card theme.',
    runtime: 'chat-reactive',
    status: 'prototype-ready',
    category: 'creative',
    commands: [],
    chatSignals: ['story-like messages', 'emoji themes'],
    overlayAspect: 'either',
    sourcePrototype: 'games/memorylane.html',
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
    name: 'Pixel Battle',
    shortName: 'Pixel Battle',
    description: 'Chat paints a shared pixel canvas coordinate by coordinate.',
    howToPlay: 'Send a color and coordinate. The shared board tracks artists and can use optional templates for community art goals.',
    runtime: 'board-state',
    status: 'prototype-ready',
    category: 'creative',
    commands: [
      { trigger: 'paint red 10 5', description: 'Paint a pixel using color, X and Y.' },
      { trigger: 'blue 10 5', description: 'Short-form paint command.' },
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
    description: 'A shared coordinate grid hides treasures and gives hot/cold clues after each dig.',
    howToPlay: 'Dig a coordinate such as B5. Each revealed square gives proximity clues until all treasures in the round are found.',
    runtime: 'board-state',
    status: 'prototype-ready',
    category: 'strategy',
    commands: [
      { trigger: '!dig B5', description: 'Dig a coordinate on the treasure map.' },
    ],
    overlayAspect: 'either',
    sourcePrototype: 'games/treasurehunt.html',
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
