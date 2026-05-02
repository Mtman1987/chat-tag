import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/auth';
import { readAppState, updateAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireAdminRequest(req);
  if (!auth.ok) return auth.response;
  try {
    const state = await readAppState();
    return NextResponse.json(state.gameSettings.default || {});
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAdminRequest(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    await updateAppState((state) => {
      state.gameSettings.default = { ...state.gameSettings.default, ...body };
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
