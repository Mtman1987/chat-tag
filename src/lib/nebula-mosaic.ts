import {
  getChannelGameSettings,
  getGameHubStore,
  getOrCreateGameHubPlayer,
  joinGameHubGame,
  normalizeGameHubChannel,
} from '@/lib/game-hub-state';

export const MOSAIC_GAME_ID = 'pixelbattle';
export const MOSAIC_WIDTH = 40;
export const MOSAIC_HEIGHT = 50;
export const MOSAIC_BOARD_WIDTH = 20;
export const MOSAIC_BOARD_HEIGHT = 25;
export const MOSAIC_IDLE_MS = 30 * 60_000;
export const MOSAIC_OVERVIEW_MS = 15_000;
export const MOSAIC_GENERATION_MAX_ATTEMPTS = 3;
export const MOSAIC_GENERATION_RETRY_MS = 10_000;

function isRecoverableExhaustedMosaicRequest(item: { status?: unknown; attempts?: unknown; recoveryVersion?: unknown }) {
  return item.status === 'failed'
    && Math.max(0, Number(item.attempts || 0)) >= MOSAIC_GENERATION_MAX_ATTEMPTS
    && Math.max(0, Number(item.recoveryVersion || 0)) < 1;
}
export const MOSAIC_GENERATION_STALE_MS = 3 * 60_000;
// Theme requests stay free while the SPMT XP economy and redemption rules are
// being finalized. A positive deployment override can re-enable charging later.
export const MOSAIC_XP_COST = Math.max(0, Math.floor(Number(process.env.MOSAIC_REQUEST_XP_COST || 0)));

export const MOSAIC_COLORS = {
  R: { name: 'red', hex: '#ef4444' },
  B: { name: 'blue', hex: '#3b82f6' },
  G: { name: 'green', hex: '#22c55e' },
  Y: { name: 'yellow', hex: '#eab308' },
  P: { name: 'purple', hex: '#a855f7' },
  O: { name: 'orange', hex: '#f97316' },
  PK: { name: 'pink', hex: '#ec4899' },
  W: { name: 'white', hex: '#f8fafc' },
  K: { name: 'black', hex: '#111827' },
  C: { name: 'cyan', hex: '#06b6d4' },
} as const;

export type MosaicColorCode = keyof typeof MOSAIC_COLORS;
export type MosaicBoardNumber = 1 | 2 | 3 | 4;

export type MosaicThemeRequest = {
  id: string;
  theme: string;
  playerId: string;
  username: string;
  displayName: string;
  requestedAt: string;
  xpCost: number;
  status: 'pending' | 'generating' | 'failed';
  error?: string;
  attempts?: number;
  lastAttemptAt?: string;
  retryAt?: string;
  recoveryVersion?: number;
};

export type NebulaMosaicArtwork = {
  id: string;
  theme: string;
  requestedBy: string;
  requestedByPlayerId: string;
  createdAt: string;
  updatedAt: string;
  lastInteractionAt: string;
  status: 'active' | 'suspended' | 'completed' | 'archived';
  provider?: string;
  sourceImageUrl?: string;
  target: MosaicColorCode[];
  painted: string[];
  paintedBy: string[];
  activeBoard: MosaicBoardNumber;
  viewMode: 'board' | 'all';
  viewUntil?: string;
  awardedMilestones: string[];
  activeIdleMs?: number;
  lastHeartbeatAt?: string;
};

export type NebulaMosaicChannelState = {
  current?: NebulaMosaicArtwork;
  queue: MosaicThemeRequest[];
  saves: NebulaMosaicArtwork[];
};

export type MosaicPaintCommand = {
  coordinate: string;
  column: number;
  row: number;
  color: MosaicColorCode;
};

const COLOR_ALIASES: Record<string, MosaicColorCode> = {
  r: 'R', red: 'R', b: 'B', blue: 'B', g: 'G', green: 'G', y: 'Y', yellow: 'Y',
  p: 'P', purple: 'P', o: 'O', orange: 'O', pk: 'PK', pink: 'PK', w: 'W', white: 'W',
  k: 'K', black: 'K', c: 'C', cyan: 'C',
};

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

export function normalizeMosaicTheme(value: unknown): string {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function validateMosaicTheme(value: unknown): string {
  const theme = normalizeMosaicTheme(value);
  if (theme.length < 2) throw new Error('Name an artwork theme, such as !mosaic owl.');
  if (!/[a-z0-9]/i.test(theme)) throw new Error('The Mosaic theme needs letters or numbers.');
  if (/\b(nude|naked|porn|sex|blood|gore|hate|swastika)\b/i.test(theme)) {
    throw new Error('That theme cannot be used for a community Mosaic.');
  }
  return theme;
}

export function getMosaicChannelState(state: any, channelValue: unknown): NebulaMosaicChannelState {
  const settings = getChannelGameSettings(state, channelValue) as any;
  const existing = settings.mosaic && typeof settings.mosaic === 'object' ? settings.mosaic : {};
  existing.queue = Array.isArray(existing.queue) ? existing.queue : [];
  existing.saves = Array.isArray(existing.saves) ? existing.saves : [];
  settings.mosaic = existing;
  return existing as NebulaMosaicChannelState;
}

export function observeMosaicActiveTime(state: any, channelValue: unknown, now = Date.now()) {
  const mosaic = getMosaicChannelState(state, channelValue);
  const current = mosaic.current;
  if (!current || current.status !== 'active') return false;
  const previous = Date.parse(String(current.lastHeartbeatAt || 0));
  const delta = Number.isFinite(previous) && now > previous && now - previous <= 45_000 ? now - previous : 0;
  current.lastHeartbeatAt = nowIso(now);
  current.activeIdleMs = Math.max(0, Number(current.activeIdleMs || 0)) + delta;
  if (current.activeIdleMs < MOSAIC_IDLE_MS) return true;
  current.status = 'suspended';
  current.updatedAt = nowIso(now);
  mosaic.saves = [current, ...mosaic.saves.filter((item) => item.id !== current.id)].slice(0, 20);
  return true;
}

export function resumeMosaicIfNeeded(state: any, channelValue: unknown, now = Date.now()) {
  const mosaic = getMosaicChannelState(state, channelValue);
  let current = mosaic.current;
  if (!current) {
    current = mosaic.saves.find((item) => item.status === 'suspended');
    if (current) mosaic.current = current;
  }
  if (current?.status === 'suspended') {
    current.status = 'active';
    current.updatedAt = nowIso(now);
    current.lastInteractionAt = nowIso(now);
    current.activeIdleMs = 0;
    current.lastHeartbeatAt = nowIso(now);
  }
  return current || null;
}

export function queueMosaicTheme(
  state: any,
  input: { channel: unknown; userId?: unknown; username?: unknown; displayName?: unknown; theme: unknown; xpCost?: number; now?: number },
) {
  const channel = normalizeGameHubChannel(input.channel);
  if (!channel) throw new Error('A channel is required.');
  const theme = validateMosaicTheme(input.theme);
  const now = Math.max(0, Math.floor(Number(input.now ?? Date.now())));
  const player = getOrCreateGameHubPlayer(state, input);
  const mosaic = getMosaicChannelState(state, channel);
  const duplicate = mosaic.queue.some((item) => item.status !== 'failed' && item.theme.toLowerCase() === theme.toLowerCase());
  if (duplicate || mosaic.current?.theme.toLowerCase() === theme.toLowerCase()) {
    throw new Error(`“${theme}” is already active or queued.`);
  }
  const request: MosaicThemeRequest = {
    id: `mosaic-request:${channel}:${now}:${player.id}`,
    theme,
    playerId: player.id,
    username: player.username,
    displayName: player.displayName,
    requestedAt: nowIso(now),
    xpCost: Math.max(0, Math.floor(Number(input.xpCost ?? MOSAIC_XP_COST))),
    status: 'pending',
  };
  mosaic.queue = [...mosaic.queue, request].slice(-20);
  return { request, position: mosaic.queue.filter((item) => item.status !== 'failed').length };
}

export function claimNextMosaicRequest(state: any, channelValue: unknown, now = Date.now()) {
  const mosaic = getMosaicChannelState(state, channelValue);
  if (mosaic.current && !['completed', 'archived'].includes(mosaic.current.status)) return null;
  // Give an already-requested, exhausted artwork one recovery cycle after the
  // production generator fix. Persist the marker so a real provider outage
  // cannot create an infinite retry loop.
  for (const item of mosaic.queue) {
    if (!isRecoverableExhaustedMosaicRequest(item)) continue;
    item.status = 'pending';
    item.attempts = 0;
    item.recoveryVersion = 1;
    delete item.retryAt;
    delete item.error;
    break;
  }
  const request = mosaic.queue.find((item) => {
    const attempts = Math.max(0, Number(item.attempts || 0));
    if (attempts >= MOSAIC_GENERATION_MAX_ATTEMPTS) return false;
    if (item.status === 'pending') return true;
    if (item.status === 'failed') return !item.retryAt || Date.parse(item.retryAt) <= now;
    return item.status === 'generating'
      && (!item.lastAttemptAt || now - Date.parse(item.lastAttemptAt) >= MOSAIC_GENERATION_STALE_MS);
  });
  if (!request) return null;
  request.status = 'generating';
  request.attempts = Math.max(0, Number(request.attempts || 0)) + 1;
  request.lastAttemptAt = nowIso(now);
  delete request.retryAt;
  delete request.error;
  return structuredClone(request) as MosaicThemeRequest;
}

export function installMosaicTemplate(
  state: any,
  channelValue: unknown,
  requestId: string,
  targetValue: string[],
  generation: { provider?: string; sourceImageUrl?: string } = {},
  now = Date.now(),
) {
  const mosaic = getMosaicChannelState(state, channelValue);
  const request = mosaic.queue.find((item) => item.id === requestId);
  if (!request) throw new Error('Mosaic request was not found.');
  const codes = new Set(Object.keys(MOSAIC_COLORS));
  const target = targetValue.map((code) => String(code || '').toUpperCase()).filter((code) => codes.has(code)) as MosaicColorCode[];
  if (target.length !== MOSAIC_WIDTH * MOSAIC_HEIGHT) throw new Error('Generated Mosaic did not contain exactly 2,000 cells.');
  const createdAt = nowIso(now);
  const artwork: NebulaMosaicArtwork = {
    id: `mosaic:${normalizeGameHubChannel(channelValue)}:${now}`,
    theme: request.theme,
    requestedBy: request.displayName,
    requestedByPlayerId: request.playerId,
    createdAt,
    updatedAt: createdAt,
    lastInteractionAt: createdAt,
    status: 'active',
    provider: generation.provider,
    sourceImageUrl: generation.sourceImageUrl,
    target,
    painted: Array.from({ length: target.length }, () => ''),
    paintedBy: Array.from({ length: target.length }, () => ''),
    activeBoard: 1,
    viewMode: 'board',
    awardedMilestones: [],
    activeIdleMs: 0,
    lastHeartbeatAt: createdAt,
  };
  mosaic.current = artwork;
  mosaic.queue = mosaic.queue.filter((item) => item.id !== requestId);
  return artwork;
}

export function failMosaicRequest(state: any, channelValue: unknown, requestId: string, error: unknown, now = Date.now()) {
  const request = getMosaicChannelState(state, channelValue).queue.find((item) => item.id === requestId);
  if (!request) return null;
  request.status = 'failed';
  request.error = String(error || 'Mosaic generation failed.').slice(0, 240);
  if (Math.max(0, Number(request.attempts || 0)) < MOSAIC_GENERATION_MAX_ATTEMPTS) {
    request.retryAt = nowIso(now + MOSAIC_GENERATION_RETRY_MS);
  } else {
    delete request.retryAt;
  }
  return request;
}

function colorToken(value: string): MosaicColorCode | null {
  return COLOR_ALIASES[value.toLowerCase().replace(/[^a-z]/g, '')] || null;
}

export function parseMosaicPaintCommand(messageValue: unknown): MosaicPaintCommand | null {
  let source = String(messageValue || '').trim().toLowerCase();
  source = source.replace(/^!?@?spmt(?:\s+|$)/i, '').trim();
  source = source.replace(/^pixel(?:battle)?\s+|^mosaic\s+/i, '').trim();
  source = source.replace(/^play\s+|^paint\s+/i, '').trim();
  const compact = source.replace(/[^a-z0-9]/g, '');
  const compactMatch = compact.match(/^([a-t])(2[0-5]|1\d|[1-9])([a-z]{1,6})$/i);
  if (compactMatch) {
    const color = colorToken(compactMatch[3]);
    if (color) return {
      coordinate: `${compactMatch[1].toUpperCase()}${Number(compactMatch[2])}`,
      column: compactMatch[1].toLowerCase().charCodeAt(0) - 97,
      row: Number(compactMatch[2]) - 1,
      color,
    };
  }
  const coordinateMatch = source.match(/\b([a-t])\s*(2[0-5]|1\d|[1-9])\b/i);
  if (!coordinateMatch) return null;
  const remainder = source.replace(coordinateMatch[0], ' ').replace(/[^a-z]+/g, ' ').trim();
  const color = remainder.split(/\s+/).map(colorToken).find(Boolean) || null;
  if (!color) return null;
  return {
    coordinate: `${coordinateMatch[1].toUpperCase()}${Number(coordinateMatch[2])}`,
    column: coordinateMatch[1].toLowerCase().charCodeAt(0) - 97,
    row: Number(coordinateMatch[2]) - 1,
    color,
  };
}

export function parseMosaicViewCommand(messageValue: unknown): 'all' | MosaicBoardNumber | null {
  let source = String(messageValue || '').trim().toLowerCase().replace(/^!?@?spmt(?:\s+|$)/i, '').trim();
  source = source.replace(/^pixel(?:battle)?\s+|^mosaic\s+/i, '').trim();
  const match = source.match(/^(?:view|show)\s+(all|[1-4])$/);
  if (!match) return null;
  return match[1] === 'all' ? 'all' : Number(match[1]) as MosaicBoardNumber;
}

export function setMosaicView(state: any, channelValue: unknown, view: 'all' | MosaicBoardNumber, now = Date.now()) {
  const current = resumeMosaicIfNeeded(state, channelValue, now);
  if (!current) throw new Error('No saved Nebula Mosaic is ready yet. Request one with !mosaic owl.');
  current.lastInteractionAt = nowIso(now);
  current.updatedAt = nowIso(now);
  current.activeIdleMs = 0;
  current.lastHeartbeatAt = nowIso(now);
  if (view === 'all') {
    current.viewMode = 'all';
    current.viewUntil = nowIso(now + MOSAIC_OVERVIEW_MS);
  } else {
    current.activeBoard = view;
    current.viewMode = 'board';
    delete current.viewUntil;
  }
  return current;
}

export function finishMosaicForPreview(state: any, channelValue: unknown, now = Date.now()) {
  const channel = normalizeGameHubChannel(channelValue);
  const mosaic = getMosaicChannelState(state, channel);
  const artwork = resumeMosaicIfNeeded(state, channel, now);
  if (!artwork) throw new Error('No Nebula Mosaic is ready to finish.');

  // This is an owner/mod preview shortcut, not gameplay. Reveal the stored
  // target without granting 2,000 artificial paint points or milestone awards.
  artwork.painted = [...artwork.target];
  artwork.paintedBy = artwork.paintedBy.map((playerId, index) =>
    playerId && artwork.painted[index] === artwork.target[index] ? playerId : '');
  artwork.status = 'completed';
  artwork.updatedAt = nowIso(now);
  artwork.lastInteractionAt = nowIso(now);
  artwork.activeIdleMs = 0;
  artwork.lastHeartbeatAt = nowIso(now);
  artwork.viewMode = 'all';
  delete artwork.viewUntil;
  mosaic.saves = [artwork, ...mosaic.saves.filter((item) => item.id !== artwork.id)].slice(0, 20);
  return artwork;
}

function boardOrigin(board: MosaicBoardNumber) {
  return {
    x: board === 2 || board === 4 ? MOSAIC_BOARD_WIDTH : 0,
    y: board === 3 || board === 4 ? MOSAIC_BOARD_HEIGHT : 0,
  };
}

function contributorsFor(artwork: NebulaMosaicArtwork, predicate: (index: number) => boolean) {
  return [...new Set(artwork.paintedBy.filter((playerId, index) => playerId && predicate(index)))];
}

function awardMilestone(state: any, artwork: NebulaMosaicArtwork, id: string, bonus: number, contributors: string[]) {
  if (artwork.awardedMilestones.includes(id) || !contributors.length) return null;
  artwork.awardedMilestones.push(id);
  const store = getGameHubStore(state);
  for (const playerId of contributors) {
    const membership = store.players[playerId]?.joinedGames?.[MOSAIC_GAME_ID];
    if (membership) membership.score += bonus;
  }
  return { id, bonus, contributorCount: contributors.length };
}

function completed(artwork: NebulaMosaicArtwork, predicate: (index: number) => boolean) {
  for (let index = 0; index < artwork.target.length; index += 1) {
    if (predicate(index) && artwork.painted[index] !== artwork.target[index]) return false;
  }
  return true;
}

function collectNewMilestones(state: any, artwork: NebulaMosaicArtwork, paintedIndex: number) {
  const awards: Array<{ id: string; bonus: number; contributorCount: number }> = [];
  const x = paintedIndex % MOSAIC_WIDTH;
  const y = Math.floor(paintedIndex / MOSAIC_WIDTH);
  const sectorX = Math.floor(x / 10);
  const sectorY = Math.floor(y / 10);
  const sectorId = `sector:${sectorX}:${sectorY}`;
  const sectorPredicate = (index: number) => Math.floor((index % MOSAIC_WIDTH) / 10) === sectorX && Math.floor(Math.floor(index / MOSAIC_WIDTH) / 10) === sectorY;
  if (completed(artwork, sectorPredicate)) {
    const award = awardMilestone(state, artwork, sectorId, 5, contributorsFor(artwork, sectorPredicate));
    if (award) awards.push(award);
  }

  const board = (y >= 25 ? 3 : 1) + (x >= 20 ? 1 : 0) as MosaicBoardNumber;
  const origin = boardOrigin(board);
  const boardPredicate = (index: number) => {
    const px = index % MOSAIC_WIDTH;
    const py = Math.floor(index / MOSAIC_WIDTH);
    return px >= origin.x && px < origin.x + 20 && py >= origin.y && py < origin.y + 25;
  };
  if (completed(artwork, boardPredicate)) {
    const award = awardMilestone(state, artwork, `board:${board}`, 15, contributorsFor(artwork, boardPredicate));
    if (award) awards.push(award);
  }

  const color = artwork.target[paintedIndex];
  const colorPredicate = (index: number) => artwork.target[index] === color;
  if (completed(artwork, colorPredicate)) {
    const award = awardMilestone(state, artwork, `color:${color}`, 10, contributorsFor(artwork, colorPredicate));
    if (award) awards.push(award);
  }

  const wholePredicate = () => true;
  if (completed(artwork, wholePredicate)) {
    const award = awardMilestone(state, artwork, 'complete', 25, contributorsFor(artwork, wholePredicate));
    if (award) awards.push(award);
    artwork.status = 'completed';
  }
  return awards;
}

export function paintMosaicCell(
  state: any,
  input: { channel: unknown; userId?: unknown; username?: unknown; displayName?: unknown; command: MosaicPaintCommand; now?: number },
) {
  const channel = normalizeGameHubChannel(input.channel);
  const now = Math.max(0, Math.floor(Number(input.now ?? Date.now())));
  const artwork = resumeMosaicIfNeeded(state, channel, now);
  if (!artwork || artwork.status === 'completed') throw new Error('No unfinished Nebula Mosaic is ready. Request the next theme with !mosaic owl.');
  const joined = joinGameHubGame(state, { ...input, gameId: MOSAIC_GAME_ID });
  const origin = boardOrigin(artwork.activeBoard);
  const x = origin.x + input.command.column;
  const y = origin.y + input.command.row;
  const index = y * MOSAIC_WIDTH + x;
  const expected = artwork.target[index];
  artwork.lastInteractionAt = nowIso(now);
  artwork.updatedAt = nowIso(now);
  artwork.activeIdleMs = 0;
  artwork.lastHeartbeatAt = nowIso(now);
  artwork.viewMode = 'board';
  delete artwork.viewUntil;

  if (input.command.color !== expected) {
    joined.membership.score = Math.max(0, joined.membership.score - 1);
    joined.membership.lastActiveAt = nowIso(now);
    return { outcome: 'wrong' as const, expected, score: joined.membership.score, board: artwork.activeBoard, coordinate: input.command.coordinate };
  }
  if (artwork.painted[index] === expected) {
    return { outcome: 'already-painted' as const, expected, score: joined.membership.score, board: artwork.activeBoard, coordinate: input.command.coordinate };
  }

  artwork.painted[index] = expected;
  artwork.paintedBy[index] = joined.player.id;
  joined.membership.score += 1;
  joined.membership.lastActiveAt = nowIso(now);
  const milestones = collectNewMilestones(state, artwork, index);
  if (milestones.some((milestone) => milestone.id === 'complete')) {
    const mosaic = getMosaicChannelState(state, channel);
    mosaic.saves = [artwork, ...mosaic.saves.filter((item) => item.id !== artwork.id)].slice(0, 20);
  }
  return { outcome: 'painted' as const, expected, score: joined.membership.score, board: artwork.activeBoard, coordinate: input.command.coordinate, milestones };
}

export function mosaicPublicSnapshot(state: any, channelValue: unknown, now = Date.now()) {
  const channel = normalizeGameHubChannel(channelValue);
  const stored = state?.gameSettings?.default?.gameHub?.channels?.[channel]?.mosaic;
  const mosaic: NebulaMosaicChannelState = stored && typeof stored === 'object'
    ? { current: stored.current, queue: Array.isArray(stored.queue) ? stored.queue : [], saves: Array.isArray(stored.saves) ? stored.saves : [] }
    : { queue: [], saves: [] };
  const artwork = mosaic.current;
  const queueLength = mosaic.queue.filter((item) => item.status !== 'failed'
    || Math.max(0, Number(item.attempts || 0)) < MOSAIC_GENERATION_MAX_ATTEMPTS
    || isRecoverableExhaustedMosaicRequest(item)).length;
  const latestRequest = mosaic.queue.at(-1);
  const generation = latestRequest ? {
    theme: latestRequest.theme,
    status: latestRequest.status,
    error: latestRequest.error || '',
    attempts: Math.max(0, Number(latestRequest.attempts || 0)),
    maxAttempts: MOSAIC_GENERATION_MAX_ATTEMPTS,
    retryAt: latestRequest.retryAt || '',
  } : null;
  if (!artwork) return { artwork: null, queueLength, generation };
  const viewMode = artwork.status === 'completed'
    ? 'all'
    : artwork.viewMode === 'all' && Date.parse(String(artwork.viewUntil || 0)) > now ? 'all' : 'board';
  const progress = artwork.painted.reduce((count, color, index) => count + (color === artwork.target[index] ? 1 : 0), 0);
  const boardOriginValue = boardOrigin(artwork.activeBoard);
  const boardTarget: string[] = [];
  const boardPainted: string[] = [];
  for (let row = 0; row < MOSAIC_BOARD_HEIGHT; row += 1) {
    for (let column = 0; column < MOSAIC_BOARD_WIDTH; column += 1) {
      const index = (boardOriginValue.y + row) * MOSAIC_WIDTH + boardOriginValue.x + column;
      boardTarget.push(artwork.target[index]);
      boardPainted.push(artwork.painted[index] || '');
    }
  }
  return {
    artwork: {
      id: artwork.id,
      theme: artwork.theme,
      requestedBy: artwork.requestedBy,
      status: artwork.status,
      activeBoard: artwork.activeBoard,
      viewMode,
      target: viewMode === 'all' ? artwork.target : boardTarget,
      painted: viewMode === 'all' ? artwork.painted : boardPainted,
      width: viewMode === 'all' ? MOSAIC_WIDTH : MOSAIC_BOARD_WIDTH,
      height: viewMode === 'all' ? MOSAIC_HEIGHT : MOSAIC_BOARD_HEIGHT,
      progress,
      total: artwork.target.length,
      updatedAt: artwork.updatedAt,
    },
    queueLength,
    generation,
  };
}
