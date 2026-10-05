import { NextRequest, NextResponse } from 'next/server';
import { controllerAccess } from '@/lib/controller-access';
import { canonicalPlayerCommands } from '@/lib/game-hub-commands';
import { getBotSecret } from '@/lib/runtime-secrets';
export const dynamic = 'force-dynamic';
const audioCache = new Map<string, { at: number; audioDataUri: string }>();
const speaking = new Set<string>();
const lastRequest = new Map<string, number>();
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const access = controllerAccess(req, body);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { channel, game } = access;
  const key = `${channel}:${game.id}`;
  const cached = audioCache.get(key);
  const headers = { 'Cache-Control': 'private, no-store' };
  if (cached && Date.now() - cached.at < 15 * 60_000) return NextResponse.json({ audioDataUri: cached.audioDataUri }, { headers });
  if (speaking.has(channel) || speaking.size >= 4 || Date.now() - (lastRequest.get(channel) || 0) < 30_000) return NextResponse.json({ error: 'Please wait a few seconds before asking Stella to speak again.' }, { status: 429, headers });
  speaking.add(channel);
  if (lastRequest.size >= 128) lastRequest.delete(lastRequest.keys().next().value!);
  lastRequest.set(channel, Date.now());
  try {
    const command = canonicalPlayerCommands(game)[0];
    const text = `Hi, I'm Stella. Let's play ${game.name}. ${game.howToPlay} ${command ? `In Twitch chat, try ${command.trigger}. ${command.description}` : ''} To show this game on your stream or in Discord, open the Share tab.`.slice(0, 1500);
    const origin = String(process.env.STREAMWEAVER_URL || process.env.STREAMWEAVE_URL || 'https://streamweaver-new.fly.dev').replace(/\/$/, '');
    const response = await fetch(`${origin}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-bot-secret': getBotSecret() }, body: JSON.stringify({ text, tenantId: channel }), signal: AbortSignal.timeout(20_000) });
    const result = await response.json().catch(() => null);
    if (!response.ok || typeof result?.audioDataUri !== 'string' || !result.audioDataUri.startsWith('data:audio/') || result.audioDataUri.length > 2_000_000) throw new Error('No audio');
    if (audioCache.size >= 12) audioCache.delete(audioCache.keys().next().value!);
    audioCache.set(key, { at: Date.now(), audioDataUri: result.audioDataUri });
    // Private playback only. Never enqueue this guidance on a stream's TTS feed.
    return NextResponse.json({ audioDataUri: result.audioDataUri }, { headers });
  } catch {
    return NextResponse.json({ error: 'Stella’s voice is unavailable right now. Her instructions are shown below.' }, { status: 503, headers });
  } finally { speaking.delete(channel); }
}
