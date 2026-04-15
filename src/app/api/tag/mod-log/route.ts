import { NextRequest, NextResponse } from 'next/server';
import { readAppState, updateAppState, makeId } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const state = await readAppState();
    const modLog = (state as any).modLog || [];
    const adminHistory = state.adminHistory || [];

    // Merge both sources, sort newest first
    const combined = [
      ...modLog.map((e: any) => ({ ...e, source: 'mod-log' })),
      ...adminHistory.map((e: any) => ({
        id: e.id,
        actor: e.performedBy || 'unknown',
        action: e.action,
        target: e.targetUser || e.details || '',
        detail: e.details || '',
        channel: '',
        timestamp: e.timestamp,
        source: 'admin-history',
      })),
    ]
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 200);

    return NextResponse.json({ entries: combined });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { actor, action, target, detail, channel } = body;

    await updateAppState((state) => {
      if (!(state as any).modLog) (state as any).modLog = [];
      (state as any).modLog.push({
        id: makeId('mod'),
        actor: actor || 'system',
        action: action || 'unknown',
        target: target || '',
        detail: detail || '',
        channel: channel || '',
        timestamp: Date.now(),
      });
      // Cap at 500 entries
      if ((state as any).modLog.length > 500) {
        (state as any).modLog = (state as any).modLog.slice(-500);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
