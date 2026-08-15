import type { NextRequest } from 'next/server';
import { readRuntimeConfig } from '@/lib/runtime-config.server';

const DEFAULT_PRODUCTION_ORIGIN = 'https://chat-tag-new.fly.dev';

function isLocalOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '0.0.0.0';
  } catch {
    return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value);
  }
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function allowedProductionHosts() {
  return new Set([
    'chat-tag-new.fly.dev',
    ...String(process.env.CHAT_TAG_ALLOWED_PUBLIC_HOSTS || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  ]);
}

function trustedProductionOrigin(value: string) {
  const normalized = normalizeOrigin(value);
  if (!normalized) return '';
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:' || !allowedProductionHosts().has(url.hostname.toLowerCase())) return '';
    return normalized;
  } catch {
    return '';
  }
}

export function getPublicAppOrigin(req?: NextRequest) {
  const envOrigin = [
    process.env.CHAT_TAG_PUBLIC_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.PUBLIC_APP_URL,
    process.env.APP_URL,
  ].map((value) => String(value || '').trim()).find((value) => value && !isLocalOrigin(value));

  const configured = String(readRuntimeConfig().publicUrls?.appOrigin || '').trim();

  if (process.env.NODE_ENV === 'production') {
    const trustedEnvOrigin = envOrigin ? trustedProductionOrigin(envOrigin) : '';
    if (trustedEnvOrigin) return trustedEnvOrigin;

    const trustedConfiguredOrigin = configured ? trustedProductionOrigin(configured) : '';
    if (trustedConfiguredOrigin) return trustedConfiguredOrigin;

    // Production must never learn a canonical OAuth/public origin from Host,
    // Origin or forwarded request metadata. Doing so lets an untrusted request
    // poison redirects and any runtime configuration persisted from them.
    return DEFAULT_PRODUCTION_ORIGIN;
  }

  if (envOrigin) return envOrigin.replace(/\/$/, '');
  if (configured) return configured.replace(/\/$/, '');

  const requestOrigin = req?.nextUrl?.origin || req?.headers?.get('origin') || '';
  if (requestOrigin) return requestOrigin.replace(/\/$/, '');
  return 'http://localhost:9002';
}
