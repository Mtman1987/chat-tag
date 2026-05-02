import { promises as fs } from 'fs';
import path from 'path';

export type JsonObject = Record<string, any>;

export type AppState = {
  users: Record<string, JsonObject>;
  supportTickets?: Record<string, JsonObject>;
  tagPlayers: Record<string, JsonObject>;
  tagHistory: JsonObject[];
  adminHistory: JsonObject[];
  tagGame: {
    state: JsonObject;
  };
  bingoCards: Record<string, JsonObject>;
  bingoEvents: JsonObject[];
  chatTags: JsonObject[];
  botChannels: Record<string, JsonObject>;
  botSettings: {
    mutedChannels: { channels: string[] };
    blacklistedChannels: { channels: string[] };
  };
  settings: {
    botCommands?: { commands: JsonObject[] };
  };
  gameSettings: {
    default: JsonObject;
  };
  pinTags: {
    pinscorpion6521: { counts: Record<string, number> };
  };
  discordMessages: {
    lastTagAnnouncement?: JsonObject;
  };
  overlayMessages: Record<string, JsonObject[]>;
  modLog: JsonObject[];
  botRuntime: {
    joinedChannels: string[];
    firstLiveAnnouncementByChannel: Record<string, string>;
  };
};

const DEFAULT_STATE: AppState = {
  users: {},
  supportTickets: {},
  tagPlayers: {},
  tagHistory: [],
  adminHistory: [],
  tagGame: { state: { currentIt: null, lastTagTime: null } },
  bingoCards: {},
  bingoEvents: [],
  chatTags: [],
  botChannels: {},
  botSettings: {
    mutedChannels: { channels: [] },
    blacklistedChannels: { channels: [] },
  },
  settings: {},
  gameSettings: { default: {} },
  pinTags: { pinscorpion6521: { counts: {} } },
  discordMessages: {},
  overlayMessages: {},
  modLog: [],
  botRuntime: {
    joinedChannels: [],
    firstLiveAnnouncementByChannel: {},
  },
};

const DATA_DIR =
  process.env.DATA_DIR || process.env.FLY_VOLUME_PATH || path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'app-state.json');
const STATE_FILE_TMP = path.join(DATA_DIR, 'app-state.json.tmp');

let bootstrapPromise: Promise<void> | null = null;
let lock: Promise<void> = Promise.resolve();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deepMerge<T extends JsonObject>(base: T, incoming: JsonObject): T {
  const out: JsonObject = { ...base };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (Array.isArray(value)) {
      out[key] = value;
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = deepMerge((out[key] || {}) as JsonObject, value as JsonObject);
      continue;
    }
    out[key] = value;
  }
  return out as T;
}

function normalizeChannel(name: string): string {
  return String(name || '').trim().toLowerCase().replace(/^#/, '');
}

function nowIso() {
  return new Date().toISOString();
}

async function readJsonIfExists(filePath: string): Promise<any | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function ensureDefaults(state: Partial<AppState>): AppState {
  return deepMerge(structuredClone(DEFAULT_STATE), state as JsonObject);
}

async function bootstrapFromLegacyFiles(): Promise<AppState> {
  const state = structuredClone(DEFAULT_STATE);

  const rootTagStats = await readJsonIfExists(path.join(process.cwd(), 'tag-stats.json'));
  if (rootTagStats) {
    for (const p of rootTagStats.players || []) {
      const id = p.id || p.userId;
      if (!id) continue;
      state.tagPlayers[id] = {
        id,
        twitchUsername: (p.twitchUsername || p.username || id).toLowerCase(),
        avatarUrl: p.avatar || p.avatarUrl || '',
        score: p.score || 0,
        tags: p.tags || 0,
        tagged: p.tagged || 0,
        isIt: rootTagStats.currentIt === id,
        isActive: p.isActive ?? false,
      };
    }

    for (const h of rootTagStats.history || []) {
      state.tagHistory.push({
        id: `hist_${Math.random().toString(36).slice(2, 10)}`,
        taggerId: h.taggerId || h.from,
        taggedId: h.taggedId || h.to,
        streamerId: (h.streamerId || h.channel || '').replace(/^#/, ''),
        timestamp: typeof h.timestamp === 'number' ? h.timestamp : Date.now(),
        doublePoints: Boolean(h.doublePoints),
        blocked: h.blocked || null,
      });
    }

    const immunity = rootTagStats.immunity || {};
    for (const [key, value] of Object.entries(immunity)) {
      if (key.endsWith('_offline')) {
        const uid = key.replace(/_offline$/, '');
        if (state.tagPlayers[uid]) state.tagPlayers[uid].offlineImmunity = Boolean(value);
        continue;
      }
      if (key.endsWith('_timed')) {
        const uid = key.replace(/_timed$/, '');
        if (state.tagPlayers[uid] && typeof value === 'number') {
          state.tagPlayers[uid].timedImmunityUntil = value;
        }
        continue;
      }
      if (state.tagPlayers[key] && typeof value === 'string') {
        state.tagPlayers[key].noTagbackFrom = value;
      }
    }

    state.tagGame.state = {
      currentIt: rootTagStats.currentIt || null,
      lastTagTime: rootTagStats.lastUpdate || Date.now(),
    };
  }

  const muted = await readJsonIfExists(path.join(process.cwd(), 'data', 'bot-muted-channels.json'));
  if (Array.isArray(muted)) {
    state.botSettings.mutedChannels.channels = muted.map(normalizeChannel).filter(Boolean);
  }

  const blacklisted = await readJsonIfExists(
    path.join(process.cwd(), 'data', 'bot-channels-blacklist.json')
  );
  if (Array.isArray(blacklisted)) {
    state.botSettings.blacklistedChannels.channels = blacklisted
      .map(normalizeChannel)
      .filter(Boolean);
  }

  const discordLast = await readJsonIfExists(path.join(process.cwd(), 'data', 'discord-last-tag-message.json'));
  if (discordLast && typeof discordLast === 'object') {
    state.discordMessages.lastTagAnnouncement = { ...discordLast, timestamp: nowIso() };
  }

  for (const player of Object.values(state.tagPlayers)) {
    const channel = normalizeChannel((player as JsonObject).twitchUsername || '');
    if (!channel) continue;
    state.botChannels[channel] = {
      name: channel,
      status: 'joined',
      lastUpdated: nowIso(),
    };
  }

  return state;
}

async function ensureBootstrapped() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      try {
        await fs.access(STATE_FILE);
      } catch {
        const fromLegacy = await bootstrapFromLegacyFiles();
        await fs.writeFile(STATE_FILE, JSON.stringify(fromLegacy, null, 2), 'utf8');
      }
    })();
  }
  await bootstrapPromise;
}

async function readState(): Promise<AppState> {
  await ensureBootstrapped();
  let lastError: unknown;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const raw = await fs.readFile(STATE_FILE, 'utf8');
      return ensureDefaults(JSON.parse(raw));
    } catch (error: any) {
      lastError = error;
      const isParseFailure =
        error instanceof SyntaxError ||
        /Unexpected end of JSON input|Expected .* in JSON|Unterminated string in JSON/i.test(
          String(error?.message || '')
        );

      if (!isParseFailure || attempt === 3) {
        throw error;
      }

      await sleep(25 * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to read app state.');
}

async function writeState(state: AppState): Promise<void> {
  await ensureBootstrapped();
  const payload = JSON.stringify(state, null, 2);
  await fs.writeFile(STATE_FILE_TMP, payload, 'utf8');
  try {
    await fs.rename(STATE_FILE_TMP, STATE_FILE);
  } catch (error: any) {
    if (error?.code !== 'EEXIST' && error?.code !== 'EPERM') {
      throw error;
    }
    await fs.rm(STATE_FILE, { force: true });
    await fs.rename(STATE_FILE_TMP, STATE_FILE);
  }
}

async function withLock<T>(work: () => Promise<T>): Promise<T> {
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = lock;
  lock = previous.then(() => current).catch(() => current);

  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

export async function readAppState(): Promise<AppState> {
  return readState();
}

export async function updateAppState<T>(mutator: (state: AppState) => T | Promise<T>): Promise<T> {
  return withLock(async () => {
    const state = await readState();
    const result = await mutator(state);
    await writeState(state);
    return result;
  });
}

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function toMillis(value: any): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Date.parse(value);
    return Number.isNaN(n) ? null : n;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  return null;
}

export function isTimedImmune(player: JsonObject): boolean {
  const until = toMillis(player?.timedImmunityUntil);
  return typeof until === 'number' && until > Date.now();
}

export function dataDirPath(): string {
  return DATA_DIR;
}
