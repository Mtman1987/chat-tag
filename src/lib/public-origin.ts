import type { NextRequest } from 'next/server';
import { readRuntimeConfig, updateRuntimeConfig } from '@/lib/runtime-config.server';

function isLocalOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '0.0.0.0';
  } catch {
    return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value);
  }
}

export function getPublicAppOrigin(req?: NextRequest) {
  const configured = String(readRuntimeConfig().publicUrls?.appOrigin || '').trim();
  if (configured && !isLocalOrigin(configured)) {
    return configured.replace(/\/$/, '');
  }

  const requestOrigin = req?.nextUrl?.origin || req?.headers?.get('origin') || '';
  if (requestOrigin && !isLocalOrigin(requestOrigin)) {
    if (!configured || isLocalOrigin(configured)) {
      try {
        updateRuntimeConfig({
          publicUrls: {
            appOrigin: requestOrigin.replace(/\/$/, ''),
          },
        });
      } catch {
        // Fall back to the request origin even if the volume write fails.
      }
    }
    return requestOrigin.replace(/\/$/, '');
  }

  if (process.env.NODE_ENV !== 'production') {
    if (configured) {
      return configured.replace(/\/$/, '');
    }
    if (requestOrigin) {
      return requestOrigin.replace(/\/$/, '');
    }
    return 'http://localhost:9002';
  }

  return '';
}
