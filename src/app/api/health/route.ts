import { NextResponse } from 'next/server';
import { getVolumeStoreDiagnostics } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const requiredSecretNames = ['BOT_SECRET_KEY', 'CHAT_TAG_CLIENT_SECRET', 'SPMT_API_KEY'];
  const missingSecretNames = process.env.NODE_ENV === 'production'
    ? requiredSecretNames.filter((name) => !String(process.env[name] || '').trim())
    : [];
  return NextResponse.json({
    status: missingSecretNames.length ? 'not-ready' : 'ok',
    service: 'chat-tag',
    timestamp: new Date().toISOString(),
    dependencies: {
      serviceCredentials: missingSecretNames.length
        ? { status: 'unavailable', missingSecretNames }
        : { status: 'configured' },
      volumeStore: getVolumeStoreDiagnostics(),
    },
  }, { status: missingSecretNames.length ? 503 : 200 });
}
