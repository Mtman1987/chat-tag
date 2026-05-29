import { NextRequest, NextResponse } from 'next/server';
import { isBotRequest } from '@/lib/auth';
import { readAppState, updateAppState } from '@/lib/volume-store';

const TOKEN_KEYS = ['TWITCH_BOT_TOKEN', 'TWITCH_BOT_REFRESH_TOKEN'] as const;
type TokenKey = (typeof TOKEN_KEYS)[number];

function isTokenKey(value: unknown): value is TokenKey {
  return TOKEN_KEYS.includes(value as TokenKey);
}

export async function GET(req: NextRequest) {
  if (!isBotRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const state = await readAppState();
    const tokens = (state.botRuntime as any).tokens || {};
    return NextResponse.json({
      TWITCH_BOT_TOKEN: tokens.TWITCH_BOT_TOKEN || '',
      TWITCH_BOT_REFRESH_TOKEN: tokens.TWITCH_BOT_REFRESH_TOKEN || '',
      updatedAt: tokens.updatedAt || null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isBotRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const updates: Partial<Record<TokenKey, string>> = {};

    const requestedKey = body.key;
    if (isTokenKey(requestedKey) && typeof body.value === 'string' && body.value) {
      updates[requestedKey] = body.value;
    }

    for (const key of TOKEN_KEYS) {
      if (typeof body[key] === 'string' && body[key]) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No token updates provided' }, { status: 400 });
    }

    const updatedAt = new Date().toISOString();
    await updateAppState((state) => {
      const runtime = state.botRuntime as any;
      runtime.tokens = {
        ...(runtime.tokens || {}),
        ...updates,
        updatedAt,
      };
    });

    return NextResponse.json({ success: true, updatedAt });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
