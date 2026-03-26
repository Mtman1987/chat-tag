import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { dataDirPath } from '@/lib/volume-store';

export async function GET() {
  try {
    const statePath = path.join(dataDirPath(), 'app-state.json');
    const data = JSON.parse(await fs.readFile(statePath, 'utf-8'));
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
