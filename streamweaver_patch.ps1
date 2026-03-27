$files = @{
  "C:\Users\mtman\Desktop\streamweaver-main\src\lib\runtime-origin.ts" = @'
import { URL } from 'url';

const LOCAL_PORT = process.env.NEXT_PUBLIC_STREAMWEAVE_PORT || process.env.PORT || '3100';
const LOCAL_APP_URL = `http://127.0.0.1:${LOCAL_PORT}`;

function normalizeUrl(candidate?: string | null): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function extractHostname(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';

  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    return end > 0 ? trimmed.slice(1, end) : trimmed;
  }

  const firstColon = trimmed.indexOf(':');
  return firstColon === -1 ? trimmed : trimmed.slice(0, firstColon);
}

export function getConfiguredAppUrl(fallbackOrigin?: string | null): string {
  const candidates = [
    process.env.NEXT_PUBLIC_STREAMWEAVE_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.APP_URL,
    process.env.PUBLIC_APP_URL,
    fallbackOrigin,
    LOCAL_APP_URL,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate);
    if (normalized) return normalized;
  }

  return LOCAL_APP_URL;
}

export function getOAuthRedirectUri(provider: 'twitch' | 'discord' | 'youtube', fallbackOrigin?: string | null): string {
  const explicit =
    provider === 'twitch'
      ? process.env.TWITCH_REDIRECT_URI
      : provider === 'discord'
        ? process.env.DISCORD_REDIRECT_URI
        : process.env.YOUTUBE_REDIRECT_URI;

  const normalizedExplicit = normalizeUrl(explicit);
  if (normalizedExplicit) return normalizedExplicit;

  return `${getConfiguredAppUrl(fallbackOrigin)}/auth/${provider}/callback`;
}

export function getAllowedHostnames(extraHosts: string[] = []): Set<string> {
  const hostnames = new Set<string>(['127.0.0.1', 'localhost', '::1']);
  const candidates = [
    process.env.NEXT_PUBLIC_STREAMWEAVE_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.APP_URL,
    process.env.PUBLIC_APP_URL,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate);
    if (!normalized) continue;

    try {
      hostnames.add(new URL(normalized).hostname.toLowerCase());
    } catch {
      # Ignore malformed env values.
    }
  }

  const wsHost = extractHostname(process.env.NEXT_PUBLIC_STREAMWEAVE_WS_HOST || '');
  if (wsHost) {
    hostnames.add(wsHost);
  }

  for (const host of extraHosts) {
    const normalizedHost = extractHostname(host);
    if (normalizedHost) {
      hostnames.add(normalizedHost);
    }
  }

  return hostnames;
}

export function isAllowedHost(host: string, extraHosts: string[] = []): boolean {
  const hostname = extractHostname(host);
  if (!hostname) return false;
  return getAllowedHostnames(extraHosts).has(hostname);
}

export function isAllowedOrigin(origin?: string | null, extraHosts: string[] = []): boolean {
  if (!origin) return true;

  try {
    return isAllowedHost(new URL(origin).host, extraHosts);
  } catch {
    return false;
  }
}
'@;
  "C:\Users\mtman\Desktop\streamweaver-main\tsconfig.json" = @'
{
  "compilerOptions": {
    "target": "ES2018",
    "lib": [
      "dom",
      "dom.iterable",
      "esnext"
    ],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": [
        "./src/*"
      ]
    }
  },
  "include": [
    "next-env.d.ts",
    "src/**/*.ts",
    "src/**/*.tsx",
    "server.ts",
    "scripts/**/*.ts"
  ],
  "exclude": [
    "node_modules"
  ]
}
'@;
  "C:\Users\mtman\Desktop\streamweaver-main\src\lib\local-config\schemas.ts" = @'
import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);

export const appConfigSchema = z.object({
  server: z.object({
    host: z.string().trim().min(1).default(process.env.SERVER_HOST || '127.0.0.1'),
    port: z.number().int().min(1024).max(65535).default(3100),
    wsPort: z.number().int().min(1024).max(65535).default(8090),
    openBrowserOnStart: z.boolean().default(true),
  }).default({}),
  security: z.object({
    requireApiKey: z.boolean().default(true),
    apiKey: z.string().default(''),
    allowDebugRoutes: z.boolean().default(false),
  }).default({}),
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    redactSensitiveLogs: z.boolean().default(true),
  }).default({}),
});

export const twitchConfigSchema = z.object({
  clientId: z.string().default(''),
  clientSecret: z.string().default(''),
  broadcasterUsername: z.string().default(''),
  broadcasterId: z.string().default(''),
  botUsername: z.string().default(''),
});

export const discordConfigSchema = z.object({
  botToken: z.string().default(''),
  logChannelId: z.string().default(''),
  aiChatChannelId: z.string().default(''),
  shareChannelId: z.string().default(''),
  metricsChannelId: z.string().default(''),
});

export const gameConfigSchema = z.object({
  classicGamble: z.object({
    minBet: z.number().int().min(0).default(10),
    maxBet: z.number().int().min(0).default(50000),
    jackpotPercent: z.number().int().min(1).max(99).default(3),
    winPercent: z.number().int().min(1).max(99).default(38),
  }).default({}),
});

export const economyConfigSchema = z.object({
  points: z.object({
    minChatPoints: z.number().int().min(0).default(10),
    maxChatPoints: z.number().int().min(0).default(15),
    chatCooldownSeconds: z.number().int().min(1).default(15),
  }).default({}),
});

export const automationConfigSchema = z.object({
  aiProvider: z.enum(['gemini', 'edenai', 'openai']).default('gemini'),
  aiModel: z.string().default(''),
  aiBotName: z.string().default('Athena'),
  aiPersonalityName: z.string().default('Commander'),
  geminiApiKey: z.string().default(''),
  edenaiApiKey: z.string().default(''),
  openaiApiKey: z.string().default(''),
  ttsProvider: z.enum(['google', 'openai', 'inworld']).default('google'),
  ttsVoice: z.string().default('Algieba'),
});

const customRewardSchema = z.object({
  pointCost: z.number().int().default(0),
  response: z.string().default(''),
});

export const redeemsConfigSchema = z.object({
  partnerCheckin: z.object({
    rewardTitle: z.string().default(''),
    pointCost: z.number().int().default(0),
    discordGuildId: z.string().default(''),
    discordRoleName: z.string().default(''),
  }).default({}),
  pokePack: z.object({
    rewardTitle: z.string().default(''),
    pointCost: z.number().int().default(1500),
    enabledSets: z.array(z.string()).default(['base1','base2','base3','base4','base5','gym1']),
  }).default({}),
  customRewards: z.record(z.string(), customRewardSchema).default({}),
});

export const configSchemas = {
  app: appConfigSchema,
  twitch: twitchConfigSchema,
  discord: discordConfigSchema,
  game: gameConfigSchema,
  economy: economyConfigSchema,
  automation: automationConfigSchema,
  redeems: redeemsConfigSchema,
};

export type AppConfig = z.infer<typeof appConfigSchema>;
export type TwitchConfig = z.infer<typeof twitchConfigSchema>;
export type DiscordConfig = z.infer<typeof discordConfigSchema>;
export type GameConfig = z.infer<typeof gameConfigSchema>;
export type EconomyConfig = z.infer<typeof economyConfigSchema>;
export type AutomationConfig = z.infer<typeof automationConfigSchema>;
export type RedeemsConfig = z.infer<typeof redeemsConfigSchema>;

export type ConfigSectionName = keyof typeof configSchemas;
export type LocalConfigMap = {
  app: AppConfig;
  twitch: TwitchConfig;
  discord: DiscordConfig;
  game: GameConfig;
  economy: EconomyConfig;
  automation: AutomationConfig;
  redeems: RedeemsConfig;
};

export const secretFields: Record<ConfigSectionName, string[]> = {
  app: ['security.apiKey'],
  twitch: ['clientSecret'],
  discord: ['botToken'],
  game: [],
  economy: [],
  automation: ['geminiApiKey', 'edenaiApiKey', 'openaiApiKey'],
  redeems: [],
};

export const configFileOrder: ConfigSectionName[] = [
  'app',
  'twitch',
  'discord',
  'game',
  'economy',
  'automation',
  'redeems',
];

export function maskValue(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '****';
  return `${'*'.repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}

export function parseApiKey(value: unknown): string {
  const parsed = nonEmpty.safeParse(value);
  return parsed.success ? parsed.data : '';
}
'@;
  "C:\Users\mtman\Desktop\streamweaver-main\src\lib\local-config\service.ts" = @'
import * as crypto from 'crypto';
import * as fs from 'fs';
import { promises as fsp } from 'fs';
import * as path from 'path';
import {
  configFileOrder,
  configSchemas,
  maskValue,
  parseApiKey,
  secretFields,
  type ConfigSectionName,
  type LocalConfigMap,
} from './schemas';
import { readUserConfigSync } from '@/lib/user-config';

const CONFIG_DIR = path.resolve(process.cwd(), 'config');

let cached: LocalConfigMap | null = null;
let initialized = false;
let initPromise: Promise<LocalConfigMap> | null = null;

function sectionPath(section: ConfigSectionName): string {
  return path.join(CONFIG_DIR, `${section}.json`);
}

function getDeepValue(obj: Record<string, any>, dotted: string): unknown {
  return dotted.split('.').reduce((acc: any, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}

function setDeepValue(obj: Record<string, any>, dotted: string, value: unknown): void {
  const keys = dotted.split('.');
  let current: Record<string, any> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key] || typeof current[key] !== 'object') current[key] = {};
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}.${crypto.randomUUID()}`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fsp.rename(tmp, filePath);
}

function defaultSection(section: ConfigSectionName): LocalConfigMap[ConfigSectionName] {
  return configSchemas[section].parse({}) as LocalConfigMap[ConfigSectionName];
}

function generateApiKey(): string {
  return crypto.randomBytes(24).toString('hex');
}

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535 ? parsed : fallback;
}

function migrateFromLegacy(config: LocalConfigMap): LocalConfigMap {
  const legacyUserConfig = readUserConfigSync();
  const isProductionRuntime = process.env.NODE_ENV === 'production';

  const migrated: LocalConfigMap = {
    ...config,
    twitch: {
      ...config.twitch,
      broadcasterUsername: config.twitch.broadcasterUsername || legacyUserConfig.TWITCH_BROADCASTER_USERNAME || '',
      broadcasterId: config.twitch.broadcasterId || legacyUserConfig.TWITCH_BROADCASTER_ID || '',
      clientId: config.twitch.clientId || process.env.TWITCH_CLIENT_ID || '',
      clientSecret: config.twitch.clientSecret || process.env.TWITCH_CLIENT_SECRET || '',
      botUsername: config.twitch.botUsername || process.env.NEXT_PUBLIC_TWITCH_BOT_USERNAME || '',
    },
    discord: {
      ...config.discord,
      botToken: config.discord.botToken || process.env.DISCORD_BOT_TOKEN || '',
      logChannelId: config.discord.logChannelId || legacyUserConfig.NEXT_PUBLIC_DISCORD_LOG_CHANNEL_ID || '',
      aiChatChannelId: config.discord.aiChatChannelId || legacyUserConfig.NEXT_PUBLIC_DISCORD_AI_CHAT_CHANNEL_ID || '',
      shareChannelId: config.discord.shareChannelId || legacyUserConfig.NEXT_PUBLIC_DISCORD_SHARE_CHANNEL_ID || '',
      metricsChannelId: config.discord.metricsChannelId || legacyUserConfig.NEXT_PUBLIC_DISCORD_METRICS_CHANNEL_ID || '',
    },
    automation: {
      ...config.automation,
      aiProvider: (legacyUserConfig.AI_PROVIDER as any) || config.automation.aiProvider,
      aiModel: legacyUserConfig.AI_MODEL || config.automation.aiModel,
      aiBotName: legacyUserConfig.AI_BOT_NAME || config.automation.aiBotName,
      aiPersonalityName: legacyUserConfig.AI_PERSONALITY_NAME || config.automation.aiPersonalityName,
      geminiApiKey: config.automation.geminiApiKey || legacyUserConfig.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '',
      edenaiApiKey: config.automation.edenaiApiKey || legacyUserConfig.EDENAI_API_KEY || process.env.EDENAI_API_KEY || '',
      openaiApiKey: config.automation.openaiApiKey || legacyUserConfig.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
      ttsVoice: legacyUserConfig.TTS_VOICE || config.automation.ttsVoice,
    },
    app: {
      ...config.app,
      server: {
        ...config.app.server,
        host: config.app.server.host || process.env.SERVER_HOST || (isProductionRuntime ? '0.0.0.0' : '127.0.0.1'),
        port: config.app.server.port || parsePort(process.env.PORT, 3100),
        wsPort: config.app.server.wsPort || parsePort(process.env.WS_PORT, 8090),
        openBrowserOnStart: isProductionRuntime ? false : config.app.server.openBrowserOnStart,
      },
      security: {
        ...config.app.security,
        apiKey: parseApiKey(config.app.security.apiKey) || parseApiKey(process.env.STREAMWEAVER_API_KEY) || generateApiKey(),
      },
    },
  };

  return {
    app: configSchemas.app.parse(migrated.app),
    twitch: configSchemas.twitch.parse(migrated.twitch),
    discord: configSchemas.discord.parse(migrated.discord),
    game: configSchemas.game.parse(migrated.game),
    economy: configSchemas.economy.parse(migrated.economy),
    automation: configSchemas.automation.parse(migrated.automation),
    redeems: configSchemas.redeems.parse(config.redeems || {}),
  };
}

export async function initializeLocalConfig(): Promise<LocalConfigMap> {
  if (initialized && cached) return cached;

  if (initPromise) return initPromise;

  initPromise = (async () => {
    await fsp.mkdir(CONFIG_DIR, { recursive: true });

    const draft = {} as LocalConfigMap;
    for (const section of configFileOrder) {
      const filePath = sectionPath(section);
      try {
        const raw = await fsp.readFile(filePath, 'utf-8');
        draft[section] = configSchemas[section].parse(JSON.parse(raw)) as any;
      } catch {
        draft[section] = defaultSection(section) as any;
      }
    }

    const migrated = migrateFromLegacy(draft);

    for (const section of configFileOrder) {
      await writeJsonAtomic(sectionPath(section), migrated[section]);
    }

    cached = migrated;
    initialized = true;
    return migrated;
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

export async function getAllConfig(): Promise<LocalConfigMap> {
  return initializeLocalConfig();
}

export async function getConfigSection<K extends ConfigSectionName>(section: K): Promise<LocalConfigMap[K]> {
  const all = await initializeLocalConfig();
  return all[section];
}

export async function updateConfigSection<K extends ConfigSectionName>(
  section: K,
  updates: Partial<LocalConfigMap[K]>
): Promise<LocalConfigMap[K]> {
  const all = await initializeLocalConfig();
  const merged = {
    ...all[section],
    ...updates,
  } as LocalConfigMap[K];

  const parsed = configSchemas[section].parse(merged) as LocalConfigMap[K];
  all[section] = parsed as any;
  await writeJsonAtomic(sectionPath(section), parsed);
  cached = all;
  return parsed;
}

export async function getPublicConfigSection<K extends ConfigSectionName>(section: K): Promise<Record<string, unknown>> {
  const full = (await getConfigSection(section)) as Record<string, any>;
  const result = JSON.parse(JSON.stringify(full)) as Record<string, any>;

  for (const dottedPath of secretFields[section]) {
    const value = getDeepValue(full, dottedPath);
    if (typeof value === 'string') {
      setDeepValue(result, dottedPath, value ? maskValue(value) : '');
      setDeepValue(result, `${dottedPath}Configured`, Boolean(value));
    }
  }

  return result;
}

export async function getPublicConfigAll(): Promise<Record<ConfigSectionName, Record<string, unknown>>> {
  await initializeLocalConfig();
  const out = {} as Record<ConfigSectionName, Record<string, unknown>>;
  for (const section of configFileOrder) {
    out[section] = await getPublicConfigSection(section);
  }
  return out;
}

export async function validateLocalApiKey(apiKey?: string | null): Promise<boolean> {
  const cfg = await getConfigSection('app');
  if (!cfg.security.requireApiKey) return true;
  const provided = apiKey || '';
  const configuredKey = parseApiKey(cfg.security.apiKey);
  const envFallbackKey = parseApiKey(process.env.STREAMWEAVER_API_KEY);

  if (configuredKey && provided === configuredKey) return true;
  if (envFallbackKey && provided === envFallbackKey) return true;
  return false;
}

export async function isDebugRoutesEnabled(): Promise<boolean> {
  const cfg = await getConfigSection('app');
  return Boolean(cfg.security.allowDebugRoutes);
}

export function validateLocalApiKeySync(apiKey?: string | null): boolean {
  try {
    const filePath = sectionPath('app');
    if (!fs.existsSync(filePath)) return false;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = configSchemas.app.parse(JSON.parse(raw));
    if (!parsed.security.requireApiKey) return true;
    const provided = apiKey || '';
    const configuredKey = parseApiKey(parsed.security.apiKey);
    const envFallbackKey = parseApiKey(process.env.STREAMWEAVER_API_KEY);
    return Boolean((configuredKey && provided === configuredKey) || (envFallbackKey && provided === envFallbackKey));
  } catch {
    return false;
  }
}

export function getConfigDirectoryPath(): string {
  return CONFIG_DIR;
}
'@;
  "C:\Users\mtman\Desktop\streamweaver-main\src\lib\local-config\auth.ts" = @'
import { NextRequest, NextResponse } from 'next/server';
import { validateLocalApiKey } from './service';
import { isAllowedHost } from '@/lib/runtime-origin';

const MAX_CONTENT_LENGTH_BYTES = 5 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_GET_REQUESTS = 300;
const RATE_LIMIT_MUTATION_REQUESTS = 120;
const RATE_LIMIT_AUTH_REQUESTS = 60;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

function pruneRateLimitBuckets(now: number): void {
  if (rateLimitBuckets.size < 2000) return;
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

function clientAddress(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for') || '';
  const first = forwardedFor.split(',')[0]?.trim();
  return first || 'local';
}

function enforceContentLengthLimit(method: string, headers: Headers): NextResponse | null {
  if (!['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) return null;

  const raw = headers.get('content-length');
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  if (parsed > MAX_CONTENT_LENGTH_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  return null;
}

function resolveRateLimitMax(method: string, pathname: string): number {
  const normalizedMethod = method.toUpperCase();
  if (pathname.startsWith('/api/auth/')) return RATE_LIMIT_AUTH_REQUESTS;
  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD' || normalizedMethod === 'OPTIONS') {
    return RATE_LIMIT_GET_REQUESTS;
  }
  return RATE_LIMIT_MUTATION_REQUESTS;
}

function enforceRateLimit(method: string, pathname: string, headers: Headers): NextResponse | null {
  const now = Date.now();
  pruneRateLimitBuckets(now);

  const key = `${clientAddress(headers)}:${method.toUpperCase()}:${pathname}`;
  const maxRequests = resolveRateLimitMax(method, pathname);
  const existing = rateLimitBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }

  if (existing.count >= maxRequests) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  existing.count += 1;
  return null;
}

function runRequestGuards(method: string, pathname: string, headers: Headers): NextResponse | null {
  const sizeDenied = enforceContentLengthLimit(method, headers);
  if (sizeDenied) return sizeDenied;

  return enforceRateLimit(method, pathname, headers);
}

export function requestApiKey(request: NextRequest): string {
  const headerKey = request.headers.get('x-api-key');
  if (headerKey) return headerKey;

  if (process.env.STREAMWEAVER_ALLOW_QUERY_API_KEY === 'true') {
    return request.nextUrl.searchParams.get('apiKey') || '';
  }

  return '';
}

export async function requireLocalApiAuth(request: NextRequest): Promise<NextResponse | null> {
  const host = request.headers.get('host') || '';
  if (!isAllowedHost(host)) {
    return NextResponse.json({ error: 'Forbidden host' }, { status: 403 });
  }

  const deniedByGuards = runRequestGuards(request.method, request.nextUrl.pathname, request.headers);
  if (deniedByGuards) return deniedByGuards;

  const ok = await validateLocalApiKey(requestApiKey(request));
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

export function requestApiKeyFromRequest(request: Request): string {
  const headerKey = request.headers.get('x-api-key');
  if (headerKey) return headerKey;

  if (process.env.STREAMWEAVER_ALLOW_QUERY_API_KEY !== 'true') {
    return '';
  }

  try {
    const parsed = new URL(request.url);
    return parsed.searchParams.get('apiKey') || '';
  } catch {
    return '';
  }
}

export async function requireLocalApiAuthRequest(request: Request): Promise<NextResponse | null> {
  const host = request.headers.get('host') || '';
  if (!isAllowedHost(host)) {
    return NextResponse.json({ error: 'Forbidden host' }, { status: 403 });
  }

  let pathname = '/api/unknown';
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    // Keep fallback pathname if URL parsing fails.
  }

  const deniedByGuards = runRequestGuards(request.method, pathname, request.headers);
  if (deniedByGuards) return deniedByGuards;

  const ok = await validateLocalApiKey(requestApiKeyFromRequest(request));
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
'@;
  "C:\Users\mtman\Desktop\streamweaver-main\src\server\routes.ts" = @'
import * as http from 'http';
import * as url from 'url';
import { getStoredTokens } from '../lib/token-utils.server';
import { resolve } from 'path';
import { promises as fs } from 'fs';
import { validateLocalApiKeySync } from '../lib/local-config/service';
import { getConfiguredAppUrl, isAllowedOrigin } from '../lib/runtime-origin';

function isAuthorized(headers: http.IncomingHttpHeaders): boolean {
    const key = headers['x-api-key'];
    const apiKey = Array.isArray(key) ? key[0] : key;
    return validateLocalApiKeySync(apiKey || '');
}

function getStatusWebSocketUrl(): string {
    const explicitUrl = process.env.NEXT_PUBLIC_STREAMWEAVE_WS_URL;
    if (explicitUrl) {
        return explicitUrl;
    }

    const appUrl = new URL(getConfiguredAppUrl());
    const wsProtocol = appUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsPort = process.env.NEXT_PUBLIC_STREAMWEAVE_WS_PORT || process.env.WS_PORT || '8090';
    return `${wsProtocol}//${appUrl.hostname}:${wsPort}`;
}

export function createHttpHandler(broadcast: (message: object) => void): http.RequestListener {
    return async (req, res) => {
        const parsedUrl = url.parse(req.url || '', true);
        const pathname = parsedUrl.pathname;
        console.log(`[HTTP] ${req.method} ${pathname}`);

        const origin = req.headers.origin;
        if (!isAllowedOrigin(origin)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Forbidden origin' }));
            return;
        }
        
        if (isAllowedOrigin(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin || getConfiguredAppUrl());
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }
        
        try {
            if (pathname === '/api/auth/share' && req.method === 'GET') {
                if (!isAuthorized(req.headers)) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Unauthorized' }));
                    return;
                }

                const tokens = await getStoredTokens();
                if (!tokens) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'No tokens available' }));
                    return;
                }
                
                const authData = {
                    twitch: {
                        broadcasterUsername: tokens.broadcasterUsername,
                        botUsername: tokens.botUsername,
                        connected: Boolean(tokens.broadcasterToken || tokens.botToken)
                    },
                    discord: {
                        connected: Boolean(process.env.DISCORD_BOT_TOKEN)
                    }
                };
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(authData));
                return;
            }
            
            if (pathname === '/api/discord/members' && req.method === 'GET') {
                if (!isAuthorized(req.headers)) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Unauthorized' }));
                    return;
                }

                const botToken = process.env.DISCORD_BOT_TOKEN;
                if (!botToken) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Discord bot token not configured' }));
                    return;
                }
                
                const guildId = parsedUrl.query.guildId || '1340315377774755890';
                const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members?limit=1000`, {
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!response.ok) {
                    res.writeHead(response.status, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to fetch Discord members' }));
                    return;
                }
                
                const members = await response.json();
                const memberList = members.map((member: any) => ({
                    id: member.user?.id,
                    username: member.user?.username,
                    displayName: member.nick || member.user?.display_name || member.user?.username,
                    avatar: member.user?.avatar,
                    joinedAt: member.joined_at,
                    roles: member.roles || []
                }));
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ members: memberList }));
                return;
            }
            
            if (pathname === '/api/twitch/send-message' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const { message, as, targetChannel } = JSON.parse(body);
                        
                        if (message.startsWith('[Discord]')) {
                            const discordChannelsPath = resolve(process.cwd(), 'tokens', 'discord-channels.json');
                            try {
                                const channelsData = await fs.readFile(discordChannelsPath, 'utf-8');
                                const channels = JSON.parse(channelsData);
                                if (channels.discordBridgeEnabled === false) {
                                    console.log('[HTTP /api/twitch/send-message] Discord bridge disabled, skipping message');
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: true, skipped: true }));
                                    return;
                                }
                            } catch {}
                        }
                        
                        console.log(`[HTTP /api/twitch/send-message] Sending as '${as || 'bot'}': ${message}`);
                        
                        const { getTwitchClient } = await import('../services/twitch-client');
                        const { sendWithSharedChatAwareness } = await import('../services/shared-chat');
                        const clientType = as === 'broadcaster' ? 'broadcaster' : 'bot';
                        console.log(`[HTTP /api/twitch/send-message] Requesting client type: ${clientType}`);
                        const client = getTwitchClient(clientType);
                        
                        if (!client) {
                            console.error(`[HTTP /api/twitch/send-message] ${clientType} client is null/undefined`);
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: `${clientType} client not available` }));
                            return;
                        }
                        
                        console.log(`[HTTP /api/twitch/send-message] Client username: ${(client as any).getUsername()}`);
                        
                        const channel = targetChannel || process.env.TWITCH_BROADCASTER_USERNAME || 'mtman1987';
                        
                        await sendWithSharedChatAwareness({
                            client,
                            channel,
                            message,
                            as: clientType,
                        });
                        
                        console.log(`[HTTP /api/twitch/send-message] Message sent successfully as ${clientType}`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                    } catch (e: any) {
                        console.error('[HTTP /api/twitch/send-message] Error:', e);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
                return;
            }
            
            if (pathname === '/api/__health' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok' }));
                return;
            }
            
            if (pathname === '/' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    status: 'StreamWeaver Server Running',
                    version: '2.0',
                    websocket: getStatusWebSocketUrl(),
                    timestamp: new Date().toISOString()
                }));
                return;
            }
            
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        } catch (error) {
            console.error('[HTTP Server] Error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    };
}
'@;
  "C:\Users\mtman\Desktop\streamweaver-main\src\server\websocket.ts" = @'
import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import { validateLocalApiKeySync } from '../lib/local-config/service';

const privilegedTypes = new Set([
    'send-twitch-message',
    'reconnect-twitch',
    'update-avatar-settings',
    'show-avatar',
    'hide-avatar',
    'update-bot-settings',
    'discord-voice-stream'
]);

function extractApiKeyFromRequest(request: http.IncomingMessage): string {
    const host = request.headers.host || '127.0.0.1';
    const parsed = new URL(request.url || '/', `http://${host}`);
    return parsed.searchParams.get('apiKey') || '';
}

export function createWebSocketServer(httpServer: http.Server, broadcast: (message: object) => void, cachedChatHistory: any[], channelBadges: any, twitchStatus: string, twitchClient: any) {
    const wss = new WebSocketServer({ server: httpServer });
    
    wss.on('connection', async (ws, request) => {
        console.log('[WebSocket] New client connected');
        const connectionAuthorized = validateLocalApiKeySync(extractApiKeyFromRequest(request));
        (ws as any).__localAuthorized = connectionAuthorized;
        
        try {
            const { loadChatHistory } = require('../services/chat-monitor');
            await loadChatHistory();
        } catch (e) {
            console.warn('[WebSocket] Failed to reload chat history:', e);
        }
        
        try {
            const { getChannelBadges } = require('../services/twitch');
            const badges = await getChannelBadges();
            ws.send(JSON.stringify({ 
                type: 'twitch-badges', 
                payload: { badges } 
            }));
            console.log('[WebSocket] Sent fresh badges to new client');
        } catch (e) {
            console.warn('[WebSocket] Failed to load badges for new client:', e);
        }
        
        cachedChatHistory.forEach(msg => {
            ws.send(JSON.stringify({ 
                type: 'twitch-message', 
                payload: msg 
            }));
        });
        
        ws.on('message', async (data: any) => {
            try {
                const message = JSON.parse(data.toString());

                if (privilegedTypes.has(message.type) && !(ws as any).__localAuthorized) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        payload: { message: `Unauthorized for message type ${message.type}` }
                    }));
                    return;
                }
                
                if (message.type === 'send-twitch-message') {
                    const { message: text, as } = message.payload;
                    console.log(`[WebSocket] Received message to send as ${as}: ${text}`);
                    
                    const { getTwitchClient } = require('../services/twitch-client');
                    const freshTwitchClient = getTwitchClient(as === 'bot' ? 'bot' : 'broadcaster');
                    
                    console.log(`[WebSocket] Twitch client (${as}) exists: ${!!freshTwitchClient}`);
                    console.log(`[WebSocket] Twitch client readyState: ${freshTwitchClient?.readyState?.()}`);
                    
                    if (!freshTwitchClient || !freshTwitchClient.readyState || freshTwitchClient.readyState() !== 'OPEN') {
                        console.error(`[WebSocket] Twitch ${as} client not connected`);
                        ws.send(JSON.stringify({
                            type: 'error',
                            payload: { message: `Twitch ${as} client not connected` }
                        }));
                        return;
                    }
                    
                    const channels = freshTwitchClient.getChannels();
                    if (!channels || channels.length === 0) {
                        console.error('[WebSocket] No Twitch channels available');
                        return;
                    }
                    
                    await freshTwitchClient.say(channels[0], text);
                    console.log(`[WebSocket] Message sent to Twitch as ${as}: ${text}`);
                } else if (message.type === 'reconnect-twitch') {
                    console.log('[WebSocket] Received reconnect request for Twitch');
                    try {
                        const { setupTwitchClient } = require('../services/twitch-client');
                        await setupTwitchClient();
                        console.log('[WebSocket] Twitch reconnection attempt completed');
                    } catch (e) {
                        console.error('[WebSocket] Twitch reconnection failed:', e);
                    }
                } else if (message.type === 'voice-join') {
                    const { id, name, room } = message.payload;
                    console.log(`[Voice] ${name} joined ${room}`);
                    
                    broadcast({
                        type: 'voice-user-joined',
                        payload: { id, name, room, muted: room === 'silent' }
                    });
                } else if (message.type === 'voice-leave') {
                    const { id, name, room } = message.payload;
                    console.log(`[Voice] ${name} left ${room}`);
                    
                    broadcast({
                        type: 'voice-user-left',
                        payload: { id, name, room }
                    });
                } else if (message.type === 'voice-mute') {
                    const { id, name, room, muted } = message.payload;
                    console.log(`[Voice] ${name} ${muted ? 'muted' : 'unmuted'}`);
                    
                    broadcast({
                        type: 'voice-user-muted',
                        payload: { id, name, room, muted }
                    });
                } else if (message.type === 'update-avatar-settings') {
                    const { idleUrl, talkingUrl, gestureUrl, animationType } = message.payload;
                    const { updateAvatarState } = require('../server/avatar');
                    updateAvatarState({ idleUrl, talkingUrl, gestureUrl, animationType }, broadcast);
                    console.log('[WebSocket] Updated avatar settings:', message.payload);
                } else if (message.type === 'show-avatar') {
                    const { showTalkingAvatar } = require('../server/avatar');
                    showTalkingAvatar(broadcast);
                    console.log('[WebSocket] Show avatar requested');
                } else if (message.type === 'hide-avatar') {
                    const { hideAvatarAfterDelay } = require('../server/avatar');
                    hideAvatarAfterDelay(0, broadcast);
                    console.log('[WebSocket] Hide avatar requested');
                } else if (message.type === 'update-bot-settings') {
                    const { personality, voice, name, interests } = message.payload;
                    const updates: Record<string, string> = {};
                    if (personality && typeof personality === 'string') {
                        (global as any).botPersonality = personality;
                        console.log('[WebSocket] Updated bot personality');
                    }
                    if (voice && typeof voice === 'string') {
                        (global as any).botVoice = voice;
                        updates.TTS_VOICE = voice;
                        console.log('[WebSocket] Updated bot voice to:', voice);
                    }
                    if (name && typeof name === 'string') {
                        (global as any).botName = name;
                        updates.AI_BOT_NAME = name;
                        console.log('[WebSocket] Updated bot name to:', name);
                    }
                    if (interests && typeof interests === 'string') {
                        (global as any).botInterests = interests;
                        console.log('[WebSocket] Updated bot interests');
                    }
                    if (Object.keys(updates).length > 0) {
                        const { writeUserConfig } = require('../lib/user-config');
                        writeUserConfig(updates).catch((e: any) => console.error('[WebSocket] Failed to persist bot settings:', e));
                    }
                } else if (message.type === 'voice-command') {
                    const { command } = message.payload;
                    const lowerCmd = command.toLowerCase();
                    
                    if (lowerCmd.includes('translation on') || lowerCmd.includes('translation begin')) {
                        const { setTranslationMode } = require('../services/translation-manager');
                        setTranslationMode(true);
                        console.log('[Voice Command] Translation mode enabled');
                    } else if (lowerCmd.includes('translation off') || lowerCmd.includes('translation end')) {
                        const { setTranslationMode } = require('../services/translation-manager');
                        setTranslationMode(false);
                        console.log('[Voice Command] Translation mode disabled');
                    }
                } else if (message.type === 'discord-voice-stream') {
                    const { audioDataUri, text, channelId, guildId, botToken } = message.payload;
                    console.log(`[WebSocket Server] 🎧 Received Discord voice stream request: "${text.substring(0, 50)}..."`);
                    
                    try {
                        const base64Data = audioDataUri.split(',')[1];
                        const audioBuffer = Buffer.from(base64Data, 'base64');
                        
                        console.log(`[Discord Voice] Processing ${Math.round(audioBuffer.length / 1024)}KB audio for channel ${channelId}`);
                        
                        const discordWs = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
                        
                        discordWs.on('open', () => {
                            console.log('[Discord Voice] Connected to Discord Gateway');
                            
                            discordWs.send(JSON.stringify({
                                op: 2,
                                d: {
                                    token: botToken,
                                    intents: 1,
                                    properties: {
                                        os: 'windows',
                                        browser: 'streamweaver',
                                        device: 'streamweaver'
                                    }
                                }
                            }));
                        });
                        
                        discordWs.on('message', (data) => {
                            const payload = JSON.parse(data.toString());
                            
                            if (payload.op === 10) {
                                console.log('[Discord Voice] Received hello, joining voice channel...');
                                
                                discordWs.send(JSON.stringify({
                                    op: 4,
                                    d: {
                                        guild_id: guildId,
                                        channel_id: channelId,
                                        self_mute: false,
                                        self_deaf: false
                                    }
                                }));
                            }
                            
                            if (payload.t === 'VOICE_STATE_UPDATE') {
                                console.log('[Discord Voice] ✅ Successfully joined voice channel, streaming audio...');
                                
                                setTimeout(() => {
                                    console.log('[Discord Voice] ✅ Audio playback completed');
                                    discordWs.close();
                                }, 3000);
                            }
                        });
                        
                        discordWs.on('error', (error) => {
                            console.error('[Discord Voice] ❌ WebSocket error:', error);
                        });
                        
                    } catch (error) {
                        console.error('[Discord Voice] ❌ Failed to process voice stream:', error);
                    }
                }
            } catch (error) {
                console.error('[WebSocket] Error processing client message:', error);
            }
        });
    });
    
    return wss;
}
'@;
  "C:\Users\mtman\Desktop\streamweaver-main\src\app\auth\twitch\callback\route.ts" = @'
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getConfiguredAppUrl, getOAuthRedirectUri } from '@/lib/runtime-origin';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  if (error) {
    return NextResponse.json({
      error,
      error_description: errorDescription
    }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({
      error: 'No authorization code provided'
    }, { status: 400 });
  }

  try {
    const appOrigin = getConfiguredAppUrl(request.nextUrl.origin);
    const redirectUri = getOAuthRedirectUri('twitch', request.nextUrl.origin);

    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json({
        error: 'Twitch client credentials not configured'
      }, { status: 500 });
    }

    const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      return NextResponse.json({
        error: 'Failed to exchange code for token',
        details: errorData
      }, { status: 500 });
    }

    const tokenData = await tokenResponse.json();

    const tokensDir = path.join(process.cwd(), 'tokens');
    const tokensFile = path.join(tokensDir, 'twitch-tokens.json');

    try {
      await fs.access(tokensDir);
    } catch {
      await fs.mkdir(tokensDir, { recursive: true });
    }

    const tokenExpiry = Date.now() + (tokenData.expires_in - 60) * 1000;

    let existingTokens = {};
    try {
      const existingData = await fs.readFile(tokensFile, 'utf-8');
      existingTokens = JSON.parse(existingData);
    } catch {}

    const state = searchParams.get('state');
    const isBroadcaster = state === 'broadcaster' || !state;
    const isBot = state === 'bot';
    const isCommunityBot = state === 'community-bot';
    const isGamesUser = state === 'games';
    const isAppLogin = state === 'login';
    
    const userResponse = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Client-Id': clientId,
      },
    });
    
    let userInfo = null;
    if (userResponse.ok) {
      const userData = await userResponse.json();
      userInfo = userData.data[0];
    }

    if (isAppLogin && userInfo) {
      const tokenStorage = {
        ...existingTokens,
        loginToken: tokenData.access_token,
        loginRefreshToken: tokenData.refresh_token,
        loginTokenExpiry: tokenExpiry,
        loginUsername: userInfo.login,
        lastUpdated: new Date().toISOString()
      };
      
      await fs.writeFile(tokensFile, JSON.stringify(tokenStorage, null, 2));

      const sessionData = {
        id: userInfo.id,
        username: userInfo.login,
        displayName: userInfo.display_name,
        avatar: userInfo.profile_image_url,
        loginTime: Date.now()
      };

      const response = NextResponse.redirect(`${appOrigin}/?login=success`);
      response.cookies.set('streamweaver-session', JSON.stringify(sessionData), {
        httpOnly: true,
        secure: appOrigin.startsWith('https://'),
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7
      });
      return response;
    }

    if (isGamesUser && userInfo) {
      const gamesUser = {
        id: userInfo.id,
        username: userInfo.login,
        displayName: userInfo.display_name,
        avatar: userInfo.profile_image_url
      };
      
      return NextResponse.redirect(`${appOrigin}/games?user=${encodeURIComponent(JSON.stringify(gamesUser))}`);
    }

    const validateResponse = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    });

    let username = '';
    if (validateResponse.ok) {
      const validateData = await validateResponse.json();
      username = validateData.login;
    }

    const tokenStorage = {
      ...existingTokens,
      ...(isBroadcaster ? {
        broadcasterToken: tokenData.access_token,
        broadcasterRefreshToken: tokenData.refresh_token,
        broadcasterTokenExpiry: tokenExpiry,
        broadcasterUsername: username,
      } : isBot ? {
        botToken: tokenData.access_token,
        botRefreshToken: tokenData.refresh_token,
        botTokenExpiry: tokenExpiry,
        botUsername: username,
      } : isCommunityBot ? {
        communityBotToken: tokenData.access_token,
        communityBotRefreshToken: tokenData.refresh_token,
        communityBotTokenExpiry: tokenExpiry,
        communityBotUsername: username,
      } : {}),
      lastUpdated: new Date().toISOString()
    };

    await fs.writeFile(tokensFile, JSON.stringify(tokenStorage, null, 2));

    return NextResponse.redirect(`${appOrigin}/integrations?success=true`);

  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.json({
      error: 'Internal server error during token exchange'
    }, { status: 500 });
  }
}
'@;
  "C:\Users\mtman\Desktop\streamweaver-main\src\app\api\auth\twitch\route.ts" = @'
import { NextRequest, NextResponse } from 'next/server';
import { getOAuthRedirectUri } from '@/lib/runtime-origin';

export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
  
  if (!clientId) {
    return NextResponse.json({
      error: 'Twitch client ID not configured'
    }, { status: 500 });
  }

  const redirectUri = getOAuthRedirectUri('twitch', request.nextUrl.origin);

  const roleParam = new URL(request.url).searchParams.get('role');
  const role = roleParam || 'login';

  console.log('[twitch-oauth] role:', role);
  const scope = role === 'login' ? [
    'user:read:email'
  ].join(' ') : [
    'chat:read',
    'chat:edit',
    'moderator:read:chatters',
    'channel:manage:broadcast',
    'moderator:manage:announcements',
    'channel:read:redemptions',
    'user:write:chat'
  ].join(' ');

  const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('state', role);
  authUrl.searchParams.set('force_verify', 'true');

  console.log('[twitch-oauth] authUrl:', authUrl.toString());

  return NextResponse.redirect(authUrl.toString());
}
'@;
  "C:\Users\mtman\Desktop\streamweaver-main\src\app\api\auth\twitch\manual-exchange\route.ts" = @'
import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { apiError, apiOk } from '@/lib/api-response';
import { getOAuthRedirectUri } from '@/lib/runtime-origin';
import { z } from 'zod';

const manualExchangeSchema = z.object({
  code: z.string().trim().min(1, 'Authorization code is required').max(4096, 'Authorization code is too long'),
  state: z
    .enum(['broadcaster', 'bot', 'community-bot', 'login'])
    .optional()
    .default('broadcaster'),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = manualExchangeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError('Invalid request body', { status: 400, code: 'INVALID_BODY' });
    }

    const { code, state } = parsed.data;

    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return apiError('Twitch client credentials not configured', { status: 500, code: 'MISSING_CREDENTIALS' });
    }

    const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: getOAuthRedirectUri('twitch', request.nextUrl.origin)
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      return apiError('Failed to exchange code for token', {
        status: 500,
        code: 'TOKEN_EXCHANGE_FAILED',
        details: { details: errorData },
      });
    }

    const tokenData = await tokenResponse.json();

    const userResponse = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Client-Id': clientId,
      },
    });
    
    let username = '';
    if (userResponse.ok) {
      const userData = await userResponse.json();
      username = userData.data[0]?.login || '';
    }

    const tokensDir = path.join(process.cwd(), 'tokens');
    const tokensFile = path.join(tokensDir, 'twitch-tokens.json');

    try {
      await fs.access(tokensDir);
    } catch {
      await fs.mkdir(tokensDir, { recursive: true });
    }

    const tokenExpiry = Date.now() + (tokenData.expires_in - 60) * 1000;

    let existingTokens = {};
    try {
      const existingData = await fs.readFile(tokensFile, 'utf-8');
      existingTokens = JSON.parse(existingData);
    } catch {}

    const isBroadcaster = state === 'broadcaster';
    const isBot = state === 'bot';
    const isCommunityBot = state === 'community-bot';

    const tokenStorage = {
      ...existingTokens,
      ...(isBroadcaster ? {
        broadcasterToken: tokenData.access_token,
        broadcasterRefreshToken: tokenData.refresh_token,
        broadcasterTokenExpiry: tokenExpiry,
        broadcasterUsername: username,
      } : isBot ? {
        botToken: tokenData.access_token,
        botRefreshToken: tokenData.refresh_token,
        botTokenExpiry: tokenExpiry,
        botUsername: username,
      } : isCommunityBot ? {
        communityBotToken: tokenData.access_token,
        communityBotRefreshToken: tokenData.refresh_token,
        communityBotTokenExpiry: tokenExpiry,
        communityBotUsername: username,
      } : {}),
      lastUpdated: new Date().toISOString()
    };

    await fs.writeFile(tokensFile, JSON.stringify(tokenStorage, null, 2));

    return apiOk({ 
      success: true, 
      username,
      role: state
    });

  } catch (error) {
    console.error('Manual token exchange error:', error);
    return apiError('Internal server error', { status: 500, code: 'INTERNAL_ERROR' });
  }
}
'@;
  "C:\Users\mtman\Desktop\streamweaver-main\src\app\api\auth\discord\manual-exchange\route.ts" = @'
import { NextRequest, NextResponse } from 'next/server';
import { apiError, apiOk } from '@/lib/api-response';
import { getOAuthRedirectUri } from '@/lib/runtime-origin';
import { z } from 'zod';

const discordManualExchangeSchema = z.object({
  code: z.string().trim().min(1, 'Authorization code is required').max(4096, 'Authorization code too long'),
  state: z.enum(['discord-user', 'discord-bot']).optional().default('discord-user'),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = discordManualExchangeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError('Invalid request body', { status: 400, code: 'INVALID_BODY' });
    }

    const { code, state } = parsed.data;

    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectUri = getOAuthRedirectUri('discord', request.nextUrl.origin);

    if (!clientId || !clientSecret) {
      return apiError('Discord credentials not configured', { status: 500, code: 'MISSING_CONFIG' });
    }

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });

    if (!tokenResponse.ok) {
      return apiError('Failed to exchange Discord token', {
        status: 500,
        code: 'TOKEN_EXCHANGE_FAILED',
      });
    }

    const tokenData = await tokenResponse.json();

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });

    let username = 'Discord User';
    if (userResponse.ok) {
      const userData = await userResponse.json();
      username = userData.username || 'Discord User';
    }

    return apiOk({ success: true, username, role: state });

  } catch {
    return apiError('Discord token exchange failed', { status: 500, code: 'INTERNAL_ERROR' });
  }
}
'@;
  "C:\Users\mtman\Desktop\streamweaver-main\src\app\api\auth\youtube\manual-exchange\route.ts" = @'
import { NextRequest, NextResponse } from 'next/server';
import { apiError, apiOk } from '@/lib/api-response';
import { getOAuthRedirectUri } from '@/lib/runtime-origin';
import { z } from 'zod';

const youtubeManualExchangeSchema = z.object({
  code: z.string().trim().min(1, 'Authorization code is required').max(4096, 'Authorization code too long'),
  state: z.enum(['youtube-broadcaster', 'youtube-bot']).optional().default('youtube-broadcaster'),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = youtubeManualExchangeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError('Invalid request body', { status: 400, code: 'INVALID_BODY' });
    }

    const { code, state } = parsed.data;

    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    const redirectUri = getOAuthRedirectUri('youtube', request.nextUrl.origin);

    if (!clientId || !clientSecret) {
      return apiError('YouTube credentials not configured', { status: 500, code: 'MISSING_CONFIG' });
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });

    if (!tokenResponse.ok) {
      return apiError('Failed to exchange YouTube token', {
        status: 500,
        code: 'TOKEN_EXCHANGE_FAILED',
      });
    }

    const tokenData = await tokenResponse.json();

    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });

    let username = 'YouTube User';
    if (userResponse.ok) {
      const userData = await userResponse.json();
      username = userData.name || 'YouTube User';
    }

    return apiOk({ success: true, username, role: state });

  } catch {
    return apiError('YouTube token exchange failed', { status: 500, code: 'INTERNAL_ERROR' });
  }
}
'@;
  "C:\Users\mtman\Desktop\streamweaver-main\src\services\youtube.ts" = @'
/**
 * YouTube Live Chat Integration Service
 * Handles YouTube API interactions for live streaming
 */

import { google, youtube_v3 } from 'googleapis';
import { EventEmitter } from 'events';
import { getOAuthRedirectUri } from '@/lib/runtime-origin';

export interface YouTubeMessage {
  id: string;
  authorChannelId: string;
  authorDisplayName: string;
  message: string;
  timestamp: Date;
  isSuperChat: boolean;
  superChatAmount?: number;
  isMembership: boolean;
  membershipLevel?: string;
}

export class YouTubeService extends EventEmitter {
  private youtube: youtube_v3.Youtube;
  private oauth2Client: any;
  private liveChatId: string | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private nextPageToken: string | undefined;

  constructor() {
    super();
    
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    const redirectUri = getOAuthRedirectUri('youtube');

    if (!clientId || !clientSecret) {
      console.warn('[YouTube] Client ID or Secret not configured');
    }

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    this.youtube = google.youtube({
      version: 'v3',
      auth: this.oauth2Client
    });
  }

  setAccessToken(accessToken: string, refreshToken?: string) {
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    });
  }

  getAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
  }

  async getTokensFromCode(code: string): Promise<{ access_token: string; refresh_token?: string }> {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    return tokens;
  }

  async connectToLiveChat(): Promise<void> {
    try {
      const response = await this.youtube.liveBroadcasts.list({
        part: ['snippet'],
        broadcastStatus: 'active',
        broadcastType: 'all'
      });

      if (response.data.items && response.data.items.length > 0) {
        const broadcast = response.data.items[0];
        this.liveChatId = broadcast.snippet?.liveChatId || null;

        if (this.liveChatId) {
          console.log('[YouTube] Connected to live chat:', this.liveChatId);
          this.startPolling();
          this.emit('connected');
        } else {
          console.error('[YouTube] No live chat ID found');
          this.emit('error', new Error('No live chat ID found'));
        }
      } else {
        console.log('[YouTube] No active broadcast found');
        this.emit('error', new Error('No active broadcast'));
      }
    } catch (error) {
      console.error('[YouTube] Error connecting to live chat:', error);
      this.emit('error', error);
    }
  }

  private startPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollMessages();

    this.pollInterval = setInterval(() => {
      this.pollMessages();
    }, 2000);
  }

  private async pollMessages() {
    if (!this.liveChatId) return;

    try {
      const response = await this.youtube.liveChatMessages.list({
        liveChatId: this.liveChatId,
        part: ['snippet', 'authorDetails'],
        pageToken: this.nextPageToken
      });

      this.nextPageToken = response.data.nextPageToken || undefined;

      if (response.data.items) {
        for (const item of response.data.items) {
          const message = this.parseMessage(item);
          if (message) {
            this.emit('message', message);
          }
        }
      }
    } catch (error) {
      console.error('[YouTube] Error polling messages:', error);
      this.emit('error', error);
    }
  }

  private parseMessage(item: youtube_v3.Schema$LiveChatMessage): YouTubeMessage | null {
    if (!item.snippet || !item.authorDetails) return null;

    const snippet = item.snippet;
    const author = item.authorDetails;

    return {
      id: item.id || '',
      authorChannelId: author.channelId || '',
      authorDisplayName: author.displayName || 'Unknown',
      message: snippet.displayMessage || '',
      timestamp: new Date(snippet.publishedAt || Date.now()),
      isSuperChat: snippet.type === 'superChatEvent',
      superChatAmount: snippet.superChatDetails?.amountMicros
        ? Number(snippet.superChatDetails.amountMicros) / 1_000_000
        : undefined,
      isMembership: snippet.type === 'newSponsorEvent',
      membershipLevel: snippet.type === 'newSponsorEvent' ? 
        (snippet as any).memberMilestoneChatDetails?.memberLevel : undefined
    };
  }

  async sendChatMessage(message: string): Promise<void> {
    if (!this.liveChatId) {
      throw new Error('Not connected to live chat');
    }

    try {
      await this.youtube.liveChatMessages.insert({
        part: ['snippet'],
        requestBody: {
          snippet: {
            liveChatId: this.liveChatId,
            type: 'textMessageEvent',
            textMessageDetails: {
              messageText: message
            }
          }
        }
      });

      console.log('[YouTube] Message sent:', message);
    } catch (error) {
      console.error('[YouTube] Error sending message:', error);
      throw error;
    }
  }

  async deleteChatMessage(messageId: string): Promise<void> {
    try {
      await this.youtube.liveChatMessages.delete({
        id: messageId
      });

      console.log('[YouTube] Message deleted:', messageId);
    } catch (error) {
      console.error('[YouTube] Error deleting message:', error);
      throw error;
    }
  }

  async banUser(channelId: string, permanent: boolean = false): Promise<void> {
    if (!this.liveChatId) {
      throw new Error('Not connected to live chat');
    }

    try {
      await this.youtube.liveChatBans.insert({
        part: ['snippet'],
        requestBody: {
          snippet: {
            liveChatId: this.liveChatId,
            type: permanent ? 'permanent' : 'temporary',
            bannedUserDetails: {
              channelId: channelId
            },
            banDurationSeconds: permanent ? undefined : '300'
          }
        }
      });

      console.log('[YouTube] User banned:', channelId);
    } catch (error) {
      console.error('[YouTube] Error banning user:', error);
      throw error;
    }
  }

  disconnect() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    this.liveChatId = null;
    this.nextPageToken = undefined;
    console.log('[YouTube] Disconnected from live chat');
    this.emit('disconnected');
  }
}

let youtubeService: YouTubeService | null = null;

export function getYouTubeService(): YouTubeService {
  if (!youtubeService) {
    youtubeService = new YouTubeService();
  }
  return youtubeService;
}
'@;
}

foreach ($entry in $files.GetEnumerator()) {
  [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($entry.Key)) | Out-Null
  Set-Content -LiteralPath $entry.Key -Value $entry.Value -NoNewline
}
