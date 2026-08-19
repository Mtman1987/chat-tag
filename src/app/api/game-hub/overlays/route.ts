import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { readAppState, updateAppState, type JsonObject } from '@/lib/volume-store';
import {
  cloneGameOverlayProfile,
  createGameOverlayProfile,
  normalizeGameOverlayProfile,
  patchGameOverlayProfile,
  type GameOverlayProfile,
} from '@/lib/game-hub-overlays';

export const dynamic = 'force-dynamic';

const STORE_KEY = 'gameHubOverlayProfiles';

function profileStore(state: any): Record<string, JsonObject> {
  state.gameSettings.default ||= {};
  state.gameSettings.default[STORE_KEY] ||= {};
  return state.gameSettings.default[STORE_KEY] as Record<string, JsonObject>;
}

function ownedProfiles(state: any, ownerUserId: string): GameOverlayProfile[] {
  const store = profileStore(state);
  return Object.values(store)
    .map((value) => normalizeGameOverlayProfile(value))
    .filter((value): value is GameOverlayProfile => Boolean(value && value.ownerUserId === ownerUserId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function requireUser(req: NextRequest) {
  const user = getSessionUserFromRequest(req);
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: 'Sign in to manage game overlays.' }, { status: 401 }) };
  }
  return { ok: true as const, user };
}

export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if (!auth.ok) return auth.response;
  const state = await readAppState();
  return NextResponse.json({ profiles: ownedProfiles(state, auth.user.id) });
}

export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({})) as JsonObject;

  try {
    const profile = await updateAppState((state) => {
      const store = profileStore(state);
      const cloneId = String(body.cloneId || '').trim();
      if (cloneId) {
        const source = normalizeGameOverlayProfile(store[cloneId]);
        if (!source || source.ownerUserId !== auth.user.id) throw new Error('Overlay to clone was not found.');
        const cloned = cloneGameOverlayProfile(auth.user.id, source, body.name);
        cloned.ownerLogin = String(auth.user.twitchUsername || source.ownerLogin || '').trim().toLowerCase().replace(/^#/, '');
        store[cloned.id] = cloned;
        return cloned;
      }
      const created = createGameOverlayProfile(auth.user.id, {
        ...body,
        ownerLogin: auth.user.twitchUsername,
      });
      store[created.id] = created;
      return created;
    });
    return NextResponse.json({ profile }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to create overlay.' }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireUser(req);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({})) as JsonObject;
  const id = String(body.id || '').trim();
  if (!id) return NextResponse.json({ error: 'Overlay id is required.' }, { status: 400 });

  try {
    const profile = await updateAppState((state) => {
      const store = profileStore(state);
      const existing = normalizeGameOverlayProfile(store[id]);
      if (!existing || existing.ownerUserId !== auth.user.id) throw new Error('Overlay was not found.');
      const updated = patchGameOverlayProfile(existing, {
        ...body,
        ownerLogin: auth.user.twitchUsername || existing.ownerLogin,
      });
      store[id] = updated;
      return updated;
    });
    return NextResponse.json({ profile });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to update overlay.' }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireUser(req);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({})) as JsonObject;
  const id = String(body.id || '').trim();
  if (!id) return NextResponse.json({ error: 'Overlay id is required.' }, { status: 400 });

  try {
    await updateAppState((state) => {
      const store = profileStore(state);
      const existing = normalizeGameOverlayProfile(store[id]);
      if (!existing || existing.ownerUserId !== auth.user.id) throw new Error('Overlay was not found.');
      delete store[id];
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to delete overlay.' }, { status: 404 });
  }
}
