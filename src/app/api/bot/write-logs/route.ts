import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { dataDirPath } from '@/lib/volume-store';

export async function POST(req: NextRequest) {
  try {
    const { logs } = await req.json();
    
    if (!logs) {
      return NextResponse.json({ error: 'logs required' }, { status: 400 });
    }

    const logPath = path.join(dataDirPath(), 'bot-logs.txt');
    await fs.writeFile(logPath, logs, 'utf-8');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
