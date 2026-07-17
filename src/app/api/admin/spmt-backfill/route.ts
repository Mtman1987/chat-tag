import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/auth';
import { readAppState } from '@/lib/volume-store';
import { grandfatherSpmtIdentity } from '@/lib/spmt-client';

type Candidate = { twitchId: string; twitchUsername: string; displayName: string };

function candidateFrom(id: string, record: Record<string, unknown>): Candidate | null {
  const twitchId = String(id || '').replace(/^user_/, '').trim();
  if (!/^\d+$/.test(twitchId)) return null;
  const twitchUsername = String(record.twitchUsername || record.username || '').trim();
  if (!twitchUsername) return null;
  return {
    twitchId,
    twitchUsername,
    displayName: String(record.displayName || record.twitchUsername || record.username || twitchUsername),
  };
}

export async function POST(req: NextRequest) {
  const auth = requireAdminRequest(req);
  if (!auth.ok) return auth.response;

  const state = await readAppState();
  const candidates = new Map<string, Candidate>();
  for (const [id, record] of Object.entries(state.tagPlayers || {})) {
    const candidate = candidateFrom(id, record);
    if (candidate) candidates.set(candidate.twitchId, candidate);
  }
  for (const [id, record] of Object.entries(state.users || {})) {
    const candidate = candidateFrom(id, record);
    if (candidate) candidates.set(candidate.twitchId, candidate);
  }

  const cursor = Math.max(0, Number(req.nextUrl.searchParams.get('cursor') || 0));
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 25)));
  const all = [...candidates.values()].sort((a, b) => a.twitchId.localeCompare(b.twitchId));
  const batch = all.slice(cursor, cursor + limit);
  let migrated = 0;
  let failed = 0;

  for (const candidate of batch) {
    const result = await grandfatherSpmtIdentity({ ...candidate, issueSession: false });
    if (result) migrated += 1;
    else failed += 1;
  }

  const nextCursor = cursor + batch.length < all.length ? cursor + batch.length : null;
  return NextResponse.json({
    total: all.length,
    processed: batch.length,
    migrated,
    failed,
    cursor,
    nextCursor,
    complete: nextCursor === null,
  });
}
