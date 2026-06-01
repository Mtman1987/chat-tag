import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { dataDirPath } from '@/lib/volume-store';

export type RuntimeConfig = {
  publicUrls?: {
    appOrigin?: string;
    botUrl?: string;
    dshUrl?: string;
    streamweaverApiBase?: string;
  };
  publicValues?: {
    twitchClientId?: string;
    discordWebhookUrl?: string;
    discordGuildId?: string;
    autoRotateMinutes?: string;
    adminUsernames?: string;
  };
  updatedAt?: string;
};

const CONFIG_FILE = path.join(dataDirPath(), 'runtime-config.json');

function ensureConfigDir() {
  mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
}

export function readRuntimeConfig(): RuntimeConfig {
  try {
    if (!existsSync(CONFIG_FILE)) return {};
    const raw = readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeRuntimeConfig(config: RuntimeConfig) {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

export function updateRuntimeConfig(patch: Partial<RuntimeConfig>) {
  const current = readRuntimeConfig();
  const next = {
    ...current,
    ...patch,
    publicUrls: {
      ...(current.publicUrls || {}),
      ...(patch.publicUrls || {}),
    },
    publicValues: {
      ...(current.publicValues || {}),
      ...(patch.publicValues || {}),
    },
    updatedAt: new Date().toISOString(),
  };
  writeRuntimeConfig(next);
  return next;
}

export function getRuntimePublicUrl(
  key: keyof NonNullable<RuntimeConfig['publicUrls']>,
  fallback = ''
) {
  const configured = String(readRuntimeConfig().publicUrls?.[key] || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  return String(fallback || '').trim().replace(/\/$/, '');
}

export function getRuntimePublicValue(
  key: keyof NonNullable<RuntimeConfig['publicValues']>,
  fallback = ''
) {
  const configured = String(readRuntimeConfig().publicValues?.[key] || '').trim();
  if (configured) return configured;
  return String(fallback || '').trim();
}

export function getRuntimePublicValueWithDevFallback(
  key: keyof NonNullable<RuntimeConfig['publicValues']>,
  devEnvNames: string[],
  fallback = ''
) {
  const configured = getRuntimePublicValue(key);
  if (configured) return configured;

  for (const envName of devEnvNames) {
    if (!envName.startsWith('NEXT_PUBLIC_')) continue;
    const value = String(process.env[envName] || '').trim();
    if (value) return value;
  }

  if (process.env.NODE_ENV !== 'production') {
    for (const envName of devEnvNames) {
      const value = String(process.env[envName] || '').trim();
      if (value) return value;
    }
  }

  return String(fallback || '').trim();
}
