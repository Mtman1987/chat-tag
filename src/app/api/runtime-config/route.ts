import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/auth';
import { readRuntimeConfig, updateRuntimeConfig } from '@/lib/runtime-config';

export const dynamic = 'force-dynamic';

function normalizeOrigin(value: string) {
  return String(value || '').trim().replace(/\/$/, '');
}

function normalizeString(value: unknown) {
  return String(value || '').trim();
}

export async function GET(req: NextRequest) {
  const auth = requireAdminRequest(req);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(readRuntimeConfig());
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAdminRequest(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const publicUrls = body?.publicUrls || {};
    const publicValues = body?.publicValues || {};
    const appOrigin = normalizeOrigin(publicUrls.appOrigin || body?.appOrigin || body?.publicAppOrigin);

    if (!appOrigin) {
      return NextResponse.json({ error: 'publicUrls.appOrigin is required.' }, { status: 400 });
    }

    const nextConfig: any = {
      publicUrls: {
        appOrigin,
        botUrl: normalizeOrigin(publicUrls.botUrl),
        dshUrl: normalizeOrigin(publicUrls.dshUrl),
        streamweaverApiBase: normalizeOrigin(publicUrls.streamweaverApiBase),
      },
      publicValues: {
        twitchClientId: normalizeString(publicValues.twitchClientId),
        discordWebhookUrl: normalizeString(publicValues.discordWebhookUrl),
        discordGuildId: normalizeString(publicValues.discordGuildId),
        autoRotateMinutes: normalizeString(publicValues.autoRotateMinutes),
        adminUsernames: normalizeString(publicValues.adminUsernames),
      },
    };

    for (const key of Object.keys(nextConfig.publicUrls)) {
      if (!nextConfig.publicUrls[key]) delete nextConfig.publicUrls[key];
    }
    for (const key of Object.keys(nextConfig.publicValues)) {
      if (!nextConfig.publicValues[key]) delete nextConfig.publicValues[key];
    }

    updateRuntimeConfig(nextConfig);

    return NextResponse.json({ success: true, ...nextConfig });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
