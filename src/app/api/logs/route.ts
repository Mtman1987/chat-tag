import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    // Trigger bot to write logs
    await fetch(`${process.env.BOT_URL || 'https://chat-tag-bot.fly.dev'}/write-logs`, {
      method: 'POST'
    });
    
    const logPath = path.join(process.cwd(), 'data', 'bot-logs.txt');
    
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
