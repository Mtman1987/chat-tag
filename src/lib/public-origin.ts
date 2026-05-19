import type { NextRequest } from 'next/server';

function isLocalOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '0.0.0.0';
  } catch {
    return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value);
  }
}

export function getPublicAppOrigin(req?: NextRequest) {
  const configured = process.env.CHAT_TAG_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured && !isLocalOrigin(configured)) {
    return configured.replace(/\/$/, '');
  }

  const requestOrigin = req?.nextUrl?.origin || req?.headers?.get('origin') || '';
  if (requestOrigin && !isLocalOrigin(requestOrigin)) {
    return requestOrigin.replace(/\/$/, '');
  }

  if (configured) {
    return configured.replace(/\/$/, '');
  }

  if (requestOrigin) {
    return requestOrigin.replace(/\/$/, '');
  }

  return 'http://localhost:9002';
}
