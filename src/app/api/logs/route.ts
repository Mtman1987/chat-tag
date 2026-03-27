import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { dataDirPath } from '@/lib/volume-store';

const BOT_URL = process.env.BOT_URL || 'https://chat-tag-bot.fly.dev';

export async function GET() {
  try {
    // Trigger bot to write logs
    await fetch(`${BOT_URL}/write-logs`, {
      method: 'POST'
    });

    const logPath = path.join(dataDirPath(), 'bot-logs.txt');
    
    try {
      const content = await fs.readFile(logPath, 'utf-8');
      return new NextResponse(content, {
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="bot-logs-${Date.now()}.txt"`,
        },
      });
    } catch {
      return new NextResponse('No logs available yet', {
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="bot-logs-${Date.now()}.txt"`,
        },
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
