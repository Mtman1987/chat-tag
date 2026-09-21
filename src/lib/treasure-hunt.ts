import {
  awardGameHubPoints,
  getChannelGameSettings,
  getGameHubStore,
  joinGameHubGame,
  normalizeGameHubChannel,
  normalizeGameHubPlayerId,
  spendGameHubPoints,
} from '@/lib/game-hub-state';

export const TREASURE_WIDTH = 20;
export const TREASURE_HEIGHT = 25;
export const TREASURE_COUNT = 3;
export const TREASURE_GAME_ID = 'treasurehunt';
export const TREASURE_WRONG_ANSWER_PENALTY = 2;
export const TREASURE_PASS_COST = 250;
export const TREASURE_PASS_LIMIT = 5;
export const TREASURE_TURN_MS = 90_000;
export const TREASURE_RIDDLE_TURN_MS = 5 * 60_000;
export const TREASURE_SKIP_LIMIT = 3;

type Clue = 'cold' | 'warm' | 'hot' | 'boiling';
type Riddle = { question: string; answers: string[] };
type Dig = { playerId: string; username: string; displayName: string; clue: Clue; resolved: boolean; at: string };
type Challenge = { coordinate: string; clue: Clue; diggerId: string; riddleIndex: number; question: string; answers: string[]; wrongGuesses: number; cycle: number; openedAt: string };
type TurnPlayer = { playerId: string; username: string; displayName: string; skips: number; joinedAt: string };
type TreasureHuntState = {
  roundId: string; width: number; height: number; treasureCells: number[]; digs: Record<string, Dig>;
  foundCells: number[]; activeChallenge?: Challenge; passUses: Record<string, number>; passReveals: Record<string, number[]>;
  rotation: TurnPlayer[]; turnExpiresAt?: string; kickVotes: string[];
  usedPuzzleIndices: number[];
  completedAt?: string; updatedAt: string;
};

const RIDDLES: Riddle[] = [
  { question: 'What has keys but cannot open a lock?', answers: ['piano', 'a piano', 'keyboard', 'a keyboard'] },
  { question: 'What gets wetter the more it dries?', answers: ['towel', 'a towel'] },
  { question: 'What has hands but cannot clap?', answers: ['clock', 'a clock'] },
  { question: 'What has one eye but cannot see?', answers: ['needle', 'a needle'] },
  { question: 'What has a neck but no head?', answers: ['bottle', 'a bottle'] },
  { question: 'What can travel around the world while staying in a corner?', answers: ['stamp', 'a stamp'] },
  { question: 'What has many teeth but cannot bite?', answers: ['comb', 'a comb'] },
  { question: 'What goes up but never comes down?', answers: ['age', 'your age'] },
  { question: 'What belongs to you but other people use it more?', answers: ['name', 'your name', 'my name'] },
  { question: 'What has words but never speaks?', answers: ['book', 'a book'] },
  { question: 'What can fill a room but takes up no space?', answers: ['light'] },
  { question: 'What has cities but no houses, forests but no trees, and water but no fish?', answers: ['map', 'a map'] },
  { question: 'What can you catch but not throw?', answers: ['cold', 'a cold'] },
  { question: 'What runs but never walks?', answers: ['water', 'a river', 'river'] },
  { question: 'What has a thumb and four fingers but is not alive?', answers: ['glove', 'a glove'] },
  { question: 'What kind of band never plays music?', answers: ['rubber band', 'a rubber band'] },
  { question: 'What has a head and a tail but no body?', answers: ['coin', 'a coin'] },
  { question: 'What building has the most stories?', answers: ['library', 'a library'] },
  { question: 'What can be broken without being held?', answers: ['promise', 'a promise'] },
  { question: 'What begins with T, ends with T, and has T inside?', answers: ['teapot', 'a teapot'] },
  { question: 'What has four wheels and flies?', answers: ['garbage truck', 'a garbage truck'] },
  { question: 'What is full of holes but still holds water?', answers: ['sponge', 'a sponge'] },
  { question: 'What question can you never answer yes to honestly?', answers: ['are you asleep', 'are you sleeping'] },
  { question: 'What comes once in a minute, twice in a moment, and never in a thousand years?', answers: ['m', 'the letter m', 'letter m'] },
  { question: 'The more you take, the more you leave behind. What am I?', answers: ['footsteps', 'steps'] },
  { question: 'What can you hold in your left hand but not your right?', answers: ['right elbow', 'your right elbow', 'my right elbow'] },
  { question: 'What has thirteen hearts but no other organs?', answers: ['deck of cards', 'a deck of cards', 'cards'] },
  { question: 'What kind of coat is best put on wet?', answers: ['paint', 'a coat of paint'] },
  { question: 'What has branches but no fruit, trunk, or leaves?', answers: ['bank', 'a bank'] },
  { question: 'What can you hear but not touch or see?', answers: ['sound', 'a sound'] },
];

const WORD_PUZZLES = [
  ['astronaut', 'space traveler'], ['telescope', 'tool for viewing distant stars'], ['mountain', 'very high landform'], ['community', 'people connected by a shared place or interest'],
  ['treasure', 'something valuable that is hidden'], ['compass', 'tool that points north'], ['adventure', 'an exciting or unusual journey'], ['galaxy', 'enormous family of stars'],
  ['satellite', 'object that travels around a planet'], ['spaceship', 'vehicle built to travel beyond Earth'], ['keyboard', 'board covered in keys'], ['headphones', 'speakers worn over your ears'],
  ['broadcast', 'program sent to many viewers'], ['streamer', 'person presenting a live online show'], ['passenger', 'person traveling in a vehicle'], ['captain', 'person commanding a ship'],
  ['nebula', 'cloud of gas and dust in space'], ['meteor', 'space rock glowing through an atmosphere'], ['planet', 'large world orbiting a star'], ['orbit', 'curved path around another object'],
  ['diamond', 'hard gemstone made of carbon'], ['lantern', 'portable light in a case'], ['backpack', 'bag carried on your back'], ['footsteps', 'marks or sounds left while walking'],
  ['whisper', 'speak very softly'], ['mystery', 'something difficult to explain or understand'], ['strategy', 'careful plan for reaching a goal'], ['riddle', 'question designed as a puzzle'],
  ['victory', 'success in a contest'], ['friendship', 'bond between friends'], ['moonlight', 'light reaching us from the moon'], ['starlight', 'light reaching us from stars'],
  ['anchor', 'heavy object that keeps a ship in place'], ['beacon', 'signal light used as a guide'], ['canyon', 'deep valley with steep sides'], ['castle', 'large fortified home'],
  ['comet', 'icy space object with a glowing tail'], ['crystal', 'solid with a repeating natural pattern'], ['eclipse', 'one space object blocks another from view'], ['expedition', 'organized journey with a purpose'],
  ['firefly', 'small insect that glows'], ['horizon', 'line where earth and sky appear to meet'], ['island', 'land completely surrounded by water'], ['jungle', 'dense tropical forest'],
  ['labyrinth', 'complicated maze of passages'], ['lighthouse', 'coastal tower that guides ships'], ['magnet', 'object that attracts certain metals'], ['mapmaker', 'person who creates maps'],
  ['oasis', 'fertile place with water in a desert'], ['observatory', 'building used to study the sky'], ['parachute', 'canopy that slows a fall'], ['pyramid', 'structure with triangular sides'],
  ['rainbow', 'arc of colors made by light and water'], ['rocket', 'vehicle propelled by exhaust'], ['sapphire', 'usually blue precious gemstone'], ['shadow', 'dark shape made when light is blocked'],
  ['snowflake', 'single ice crystal falling from a cloud'], ['submarine', 'vessel that travels underwater'], ['sunrise', 'the sun appearing in the morning'], ['thunder', 'sound caused by lightning'],
  ['tornado', 'violently rotating column of air'], ['volcano', 'mountain that can erupt lava'], ['waterfall', 'water dropping over a steep edge'], ['wildfire', 'uncontrolled fire across vegetation'],
  ['amulet', 'small object worn as a charm'], ['blueprint', 'technical plan for building something'], ['hourglass', 'timer using sand between glass bulbs'], ['keyhole', 'opening made to receive a key'],
  ['seashell', 'hard outer covering left by a sea animal'], ['staircase', 'set of steps between levels'], ['trapdoor', 'hidden or hinged door in a floor'], ['windmill', 'machine powered by moving air'],
] as const;

function hash(value: string) { let output = 2166136261; for (let i = 0; i < value.length; i += 1) { output ^= value.charCodeAt(i); output = Math.imul(output, 16777619); } return output >>> 0; }
function shuffledWord(word: string) {
  const letters = word.split('');
  for (let index = letters.length - 1; index > 0; index -= 1) {
    const swap = hash(`${word}:${index}`) % (index + 1);
    [letters[index], letters[swap]] = [letters[swap], letters[index]];
  }
  const result = letters.join('');
  return result === word ? `${word.slice(1)}${word[0]}` : result;
}
function puzzleBank(): Riddle[] {
  return [
    ...RIDDLES,
    ...WORD_PUZZLES.flatMap(([word, clue]) => [
      { question: `ANAGRAM: Unscramble “${shuffledWord(word)}”.`, answers: [word] },
      { question: `MISSING VOWELS: Restore “${word.replace(/[aeiou]/gi, '_')}”.`, answers: [word] },
      { question: `BACKWARDS WORD: Reverse “${word.split('').reverse().join('')}”.`, answers: [word] },
      { question: `WORD CLUE: ${clue}.`, answers: [word] },
      { question: `LETTER NUMBERS: Decode “${word.split('').map((letter) => letter.charCodeAt(0) - 96).join('-')}”.`, answers: [word] },
      { question: `SHIFT BACK ONE: Every letter moved forward once. Decode “${word.replace(/[a-z]/g, (letter) => String.fromCharCode(97 + ((letter.charCodeAt(0) - 96) % 26)))}”.`, answers: [word] },
      { question: `DOUBLE TALK: Collapse each pair in “${word.split('').map((letter) => `${letter}${letter}`).join('')}”.`, answers: [word] },
      { question: `SWAPPED HALVES: Put “${word.slice(Math.floor(word.length / 2))} ${word.slice(0, Math.floor(word.length / 2))}” back in order.`, answers: [word] },
    ]),
  ];
}
const PUZZLES = puzzleBank();
export const TREASURE_PUZZLE_COUNT = PUZZLES.length;
function roundIdAt(now: number) { return new Date(now).toISOString().slice(0, 10); }
function coordinateAt(index: number) { return `${String.fromCharCode(65 + (index % TREASURE_WIDTH))}${Math.floor(index / TREASURE_WIDTH) + 1}`; }
function normalizeAnswer(value: unknown) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }

function treasuresFor(channel: string, roundId: string) {
  const cells: number[] = [];
  for (let cursor = 0; cells.length < TREASURE_COUNT; cursor += 1) {
    const cell = hash(`${channel}:${roundId}:${cursor}`) % (TREASURE_WIDTH * TREASURE_HEIGHT);
    if (!cells.includes(cell)) cells.push(cell);
  }
  return cells;
}

function emptyState(channel: string, now: number): TreasureHuntState {
  const roundId = roundIdAt(now);
  return { roundId, width: TREASURE_WIDTH, height: TREASURE_HEIGHT, treasureCells: treasuresFor(channel, roundId), digs: {}, foundCells: [], passUses: {}, passReveals: {}, rotation: [], kickVotes: [], usedPuzzleIndices: [], updatedAt: new Date(now).toISOString() };
}

export function getTreasureHuntState(state: any, channelValue: unknown, now = Date.now()) {
  const channel = normalizeGameHubChannel(channelValue);
  const settings = getChannelGameSettings(state, channel) as any;
  const current = settings.treasureHunt as TreasureHuntState | undefined;
  if (!current || current.roundId !== roundIdAt(now) || current.width !== TREASURE_WIDTH || current.height !== TREASURE_HEIGHT) settings.treasureHunt = emptyState(channel, now);
  const game = settings.treasureHunt as TreasureHuntState;
  game.rotation ||= [];
  game.kickVotes ||= [];
  game.usedPuzzleIndices ||= [];
  return game;
}

function turnDuration(game: TreasureHuntState) {
  return game.activeChallenge && game.activeChallenge.clue !== 'cold' ? TREASURE_RIDDLE_TURN_MS : TREASURE_TURN_MS;
}

function startTurn(game: TreasureHuntState, now: number) {
  game.kickVotes = [];
  game.turnExpiresAt = game.rotation.length ? new Date(now + turnDuration(game)).toISOString() : undefined;
}

function advanceTurn(game: TreasureHuntState, now: number, options: { skipped?: boolean; drop?: boolean } = {}) {
  const current = game.rotation.shift();
  let dropped: TurnPlayer | undefined;
  if (current) {
    if (options.skipped) current.skips += 1;
    if (options.drop || current.skips >= TREASURE_SKIP_LIMIT) dropped = current;
    else game.rotation.push(current);
  }
  startTurn(game, now);
  game.updatedAt = new Date(now).toISOString();
  return { skipped: current, dropped, current: game.rotation[0] || null };
}

export function joinTreasureRotation(state: any, input: { channel: unknown; userId?: unknown; username?: unknown; displayName?: unknown; now?: number }) {
  const channel = normalizeGameHubChannel(input.channel); const now = Number(input.now ?? Date.now());
  const game = getTreasureHuntState(state, channel, now);
  const joined = joinGameHubGame(state, { ...input, gameId: TREASURE_GAME_ID });
  const existing = game.rotation.find((entry) => entry.playerId === joined.player.id);
  if (existing) return { changed: false, alreadyJoined: true, position: game.rotation.indexOf(existing) + 1, current: game.rotation[0] || null };
  game.rotation.push({ playerId: joined.player.id, username: joined.player.username, displayName: joined.player.displayName, skips: 0, joinedAt: new Date(now).toISOString() });
  if (game.rotation.length === 1) startTurn(game, now);
  game.updatedAt = new Date(now).toISOString();
  return { changed: true, alreadyJoined: false, position: game.rotation.length, current: game.rotation[0] || null };
}

export function leaveTreasureRotation(state: any, input: { channel: unknown; userId?: unknown; username?: unknown; now?: number }) {
  const channel = normalizeGameHubChannel(input.channel); const now = Number(input.now ?? Date.now()); const game = getTreasureHuntState(state, channel, now);
  const playerId = normalizeGameHubPlayerId(input.userId, input.username); const index = game.rotation.findIndex((entry) => entry.playerId === playerId);
  if (index < 0) return { changed: false, left: false, current: game.rotation[0] || null };
  const wasCurrent = index === 0; const [left] = game.rotation.splice(index, 1);
  if (wasCurrent) startTurn(game, now);
  game.kickVotes = game.kickVotes.filter((id) => id !== playerId); game.updatedAt = new Date(now).toISOString();
  return { changed: true, left: true, player: left, current: game.rotation[0] || null };
}

export function settleTreasureTurn(state: any, channelValue: unknown, now = Date.now()) {
  const game = getTreasureHuntState(state, channelValue, now);
  if (!game.rotation.length || !game.turnExpiresAt || Date.parse(game.turnExpiresAt) > now) return { changed: false, skipped: null, dropped: null, current: game.rotation[0] || null };
  const result = advanceTurn(game, now, { skipped: true });
  return { changed: true, ...result };
}

export function voteKickTreasureTurn(state: any, input: { channel: unknown; userId?: unknown; username?: unknown; now?: number }) {
  const channel = normalizeGameHubChannel(input.channel); const now = Number(input.now ?? Date.now()); settleTreasureTurn(state, channel, now);
  const game = getTreasureHuntState(state, channel, now); const voterId = normalizeGameHubPlayerId(input.userId, input.username);
  if (!game.activeChallenge || game.activeChallenge.clue !== 'boiling') return { changed: false, outcome: 'not-boiling' as const };
  if (!game.rotation.some((entry) => entry.playerId === voterId)) return { changed: false, outcome: 'not-joined' as const };
  if (game.rotation[0]?.playerId === voterId) return { changed: false, outcome: 'current-player' as const };
  if (game.kickVotes.includes(voterId)) return { changed: false, outcome: 'already-voted' as const, votes: game.kickVotes.length };
  game.kickVotes.push(voterId);
  const needed = Math.max(1, Math.floor(Math.max(1, game.rotation.length - 1) / 2) + 1);
  if (game.kickVotes.length >= needed) {
    const votes = game.kickVotes.length;
    const result = advanceTurn(game, now, { drop: true });
    return { changed: true, outcome: 'kicked' as const, votes, needed, kicked: result.dropped, current: result.current };
  }
  game.updatedAt = new Date(now).toISOString();
  return { changed: true, outcome: 'voted' as const, votes: game.kickVotes.length, needed };
}

export function parseTreasureCoordinate(value: unknown) {
  const match = String(value || '').trim().toUpperCase().match(/^([A-T])\s*(2[0-5]|1\d|[1-9])$/);
  if (!match) return null;
  const column = match[1].charCodeAt(0) - 65;
  const row = Number(match[2]) - 1;
  return { coordinate: `${match[1]}${match[2]}`, index: row * TREASURE_WIDTH + column, row, column };
}

function distance(left: number, right: number) {
  return Math.max(Math.abs((left % TREASURE_WIDTH) - (right % TREASURE_WIDTH)), Math.abs(Math.floor(left / TREASURE_WIDTH) - Math.floor(right / TREASURE_WIDTH)));
}

function clueFor(cell: number, remaining: number[]): Clue {
  const nearest = Math.min(...remaining.map((treasure) => distance(cell, treasure)));
  return nearest <= 1 ? 'boiling' : nearest === 2 ? 'hot' : nearest === 3 ? 'warm' : 'cold';
}

function riddleFor(game: TreasureHuntState, coordinate: string, cycle: number) {
  const puzzles = PUZZLES;
  if (game.usedPuzzleIndices.length >= puzzles.length) game.usedPuzzleIndices = [];
  let index = hash(`${game.roundId}:${coordinate}:${cycle}`) % puzzles.length;
  while (game.usedPuzzleIndices.includes(index)) index = (index + 1) % puzzles.length;
  game.usedPuzzleIndices.push(index);
  return { index, ...puzzles[index] };
}

function award(state: any, playerId: string, amount: number, reason: string, channel: string) {
  const player = getGameHubStore(state).players[playerId];
  if (!player) return;
  const membership = player.joinedGames?.[TREASURE_GAME_ID];
  if (membership) { membership.score += amount; membership.lastActiveAt = new Date().toISOString(); }
  awardGameHubPoints(state, player, amount, reason, { gameId: TREASURE_GAME_ID, channel });
}

export function digTreasure(state: any, input: { channel: unknown; coordinate: unknown; userId?: unknown; username?: unknown; displayName?: unknown; now?: number }) {
  const parsed = parseTreasureCoordinate(input.coordinate);
  if (!parsed) return { changed: false, outcome: 'invalid' as const };
  const channel = normalizeGameHubChannel(input.channel); const now = Number(input.now ?? Date.now());
  settleTreasureTurn(state, channel, now);
  const game = getTreasureHuntState(state, channel, now);
  if (game.completedAt) return { changed: false, outcome: 'complete' as const };
  const rotation = joinTreasureRotation(state, input);
  const playerId = normalizeGameHubPlayerId(input.userId, input.username);
  if (game.rotation[0]?.playerId !== playerId) return { changed: rotation.changed, outcome: 'not-turn' as const, position: game.rotation.findIndex((entry) => entry.playerId === playerId) + 1, current: game.rotation[0] || null };
  if (game.activeChallenge) return { changed: false, outcome: 'challenge-active' as const, challenge: game.activeChallenge };
  if (game.digs[parsed.coordinate]) return { changed: false, outcome: 'already-dug' as const, coordinate: parsed.coordinate, dig: game.digs[parsed.coordinate] };
  const joined = joinGameHubGame(state, { ...input, gameId: TREASURE_GAME_ID });
  const remaining = game.treasureCells.filter((cell) => !game.foundCells.includes(cell));
  const clue = clueFor(parsed.index, remaining);
  const riddle = riddleFor(game, parsed.coordinate, 0);
  const resolved = clue === 'cold';
  game.digs[parsed.coordinate] = { playerId: joined.player.id, username: joined.player.username, displayName: joined.player.displayName, clue, resolved, at: new Date(now).toISOString() };
  game.activeChallenge = { coordinate: parsed.coordinate, clue, diggerId: joined.player.id, riddleIndex: riddle.index, question: riddle.question, answers: riddle.answers, wrongGuesses: 0, cycle: 0, openedAt: new Date(now).toISOString() };
  startTurn(game, now);
  if (clue === 'cold') award(state, joined.player.id, 1, 'Treasure Hunt cold dig', channel);
  game.updatedAt = new Date(now).toISOString();
  return { changed: true, outcome: 'challenge' as const, coordinate: parsed.coordinate, clue, question: riddle.question, digPoints: clue === 'cold' ? 1 : 0 };
}

export function answerTreasureRiddle(state: any, input: { channel: unknown; answer: unknown; userId?: unknown; username?: unknown; displayName?: unknown; now?: number }) {
  const channel = normalizeGameHubChannel(input.channel); const now = Number(input.now ?? Date.now());
  settleTreasureTurn(state, channel, now);
  const game = getTreasureHuntState(state, channel, now); const challenge = game.activeChallenge;
  if (!challenge) return { changed: false, outcome: 'no-challenge' as const };
  const playerId = normalizeGameHubPlayerId(input.userId, input.username);
  if (game.rotation[0]?.playerId !== playerId) return { changed: false, outcome: 'not-turn' as const, current: game.rotation[0] || null };
  const joined = joinGameHubGame(state, { ...input, gameId: TREASURE_GAME_ID });
  const normalized = normalizeAnswer(input.answer);
  const correct = challenge.answers.some((answer) => normalizeAnswer(answer) === normalized);
  if (!correct) {
    const deduction = Math.min(TREASURE_WRONG_ANSWER_PENALTY, joined.player.gamePointsBalance);
    if (deduction) spendGameHubPoints(state, joined.player, deduction, 'Wrong Treasure Hunt riddle answer');
    joined.membership.score = Math.max(0, joined.membership.score - TREASURE_WRONG_ANSWER_PENALTY);
    challenge.wrongGuesses += 1;
    let changedRiddle = false;
    if (challenge.wrongGuesses >= 3) {
      challenge.cycle += 1; challenge.wrongGuesses = 0;
      const next = riddleFor(game, challenge.coordinate, challenge.cycle);
      challenge.riddleIndex = next.index; challenge.question = next.question; challenge.answers = next.answers; changedRiddle = true;
    }
    game.updatedAt = new Date(now).toISOString();
    return { changed: true, outcome: 'wrong' as const, deduction, wrongGuesses: challenge.wrongGuesses, changedRiddle, question: challenge.question };
  }
  const dig = game.digs[challenge.coordinate];
  if (dig) dig.resolved = true;
  const digPoints = challenge.clue === 'warm' ? 10 : challenge.clue === 'hot' ? 100 : 0;
  const solvePoints = challenge.clue === 'cold' ? 10 : challenge.clue === 'warm' ? 100 : challenge.clue === 'hot' ? 500 : 1_000;
  if (digPoints) award(state, challenge.diggerId, digPoints, `Treasure Hunt ${challenge.clue} dig`, channel);
  award(state, joined.player.id, solvePoints, `Treasure Hunt ${challenge.clue} riddle solved`, channel);
  let treasureCoordinate = '';
  if (challenge.clue === 'boiling') {
    const selected = parseTreasureCoordinate(challenge.coordinate)!.index;
    const treasure = game.treasureCells.filter((cell) => !game.foundCells.includes(cell)).sort((a, b) => distance(selected, a) - distance(selected, b))[0];
    if (treasure !== undefined) { game.foundCells.push(treasure); treasureCoordinate = coordinateAt(treasure); }
  }
  const coordinate = challenge.coordinate; const clue = challenge.clue;
  delete game.activeChallenge;
  if (game.foundCells.length >= TREASURE_COUNT) { game.completedAt = new Date(now).toISOString(); joined.membership.wins += 1; }
  else advanceTurn(game, now);
  game.updatedAt = new Date(now).toISOString();
  return { changed: true, outcome: 'solved' as const, coordinate, clue, digPoints, solvePoints, treasureCoordinate, foundCount: game.foundCells.length, complete: Boolean(game.completedAt) };
}

export function buyTreasurePass(state: any, input: { channel: unknown; userId?: unknown; username?: unknown; displayName?: unknown; now?: number }) {
  const channel = normalizeGameHubChannel(input.channel); const now = Number(input.now ?? Date.now());
  const game = getTreasureHuntState(state, channel, now);
  if (game.completedAt) return { changed: false, outcome: 'complete' as const };
  const joined = joinGameHubGame(state, { ...input, gameId: TREASURE_GAME_ID });
  const used = Number(game.passUses[joined.player.id] || 0);
  if (used >= TREASURE_PASS_LIMIT) return { changed: false, outcome: 'limit' as const, used };
  const revealed = game.passReveals[joined.player.id] || [];
  const target = game.treasureCells.find((cell) => !game.foundCells.includes(cell) && !revealed.includes(cell));
  if (target === undefined) return { changed: false, outcome: 'nothing-new' as const, used };
  if (joined.player.gamePointsBalance < TREASURE_PASS_COST) return { changed: false, outcome: 'insufficient' as const, balance: joined.player.gamePointsBalance };
  spendGameHubPoints(state, joined.player, TREASURE_PASS_COST, 'Treasure Hunt location pass');
  game.passUses[joined.player.id] = used + 1; game.passReveals[joined.player.id] = [...revealed, target]; game.updatedAt = new Date(now).toISOString();
  return { changed: true, outcome: 'purchased' as const, coordinate: coordinateAt(target), cost: TREASURE_PASS_COST, used: used + 1, remaining: TREASURE_PASS_LIMIT - used - 1 };
}

export function treasureHuntPublicSnapshot(state: any, channelValue: unknown, now = Date.now()) {
  const game = getTreasureHuntState(state, channelValue, now); const store = getGameHubStore(state);
  const cells = Array.from({ length: TREASURE_WIDTH * TREASURE_HEIGHT }, (_, index) => {
    const coordinate = coordinateAt(index); const dig = game.digs[coordinate];
    if (game.foundCells.includes(index)) return { coordinate, state: 'treasure' as const };
    return dig ? { coordinate, state: dig.resolved ? dig.clue : 'pending' as const } : { coordinate, state: 'hidden' as const };
  });
  const leaderboard = Object.values(store.players).filter((player) => player.joinedGames?.[TREASURE_GAME_ID])
    .map((player) => ({ username: player.displayName || player.username, score: player.joinedGames[TREASURE_GAME_ID].score, wins: player.joinedGames[TREASURE_GAME_ID].wins }))
    .sort((left, right) => right.score - left.score || right.wins - left.wins).slice(0, 10);
  return { width: game.width, height: game.height, roundId: game.roundId, cells, foundCount: game.foundCells.length, treasureCount: TREASURE_COUNT, complete: Boolean(game.completedAt), challenge: game.activeChallenge ? { coordinate: game.activeChallenge.coordinate, clue: game.activeChallenge.clue, question: game.activeChallenge.question, wrongGuesses: game.activeChallenge.wrongGuesses } : null, turn: { current: game.rotation[0] ? { username: game.rotation[0].displayName, skips: game.rotation[0].skips } : null, queue: game.rotation.map((entry) => ({ username: entry.displayName, skips: entry.skips })), expiresAt: game.turnExpiresAt || null, kickVotes: game.kickVotes.length }, passCost: TREASURE_PASS_COST, leaderboard, updatedAt: game.updatedAt };
}
