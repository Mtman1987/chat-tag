import { getBotSecret } from '@/lib/runtime-secrets';

const STREAMWEAVER_URL = String(
  process.env.STREAMWEAVER_URL || process.env.STREAMWEAVE_URL || 'https://streamweaver-new.fly.dev',
).replace(/\/$/, '');

export async function queueStellaSpeech(textValue: unknown, tenantValue: unknown = 'spacemountainlive') {
  const text = String(textValue || '').trim().slice(0, 500);
  const tenantId = String(tenantValue || 'spacemountainlive').trim().toLowerCase().replace(/^#/, '').slice(0, 80) || 'spacemountainlive';
  if (!text) return false;
  try {
    const secret = getBotSecret();
    const generated = await fetch(`${STREAMWEAVER_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': secret },
      body: JSON.stringify({ text, tenantId }),
    });
    if (!generated.ok) return false;
    const body = await generated.json().catch(() => null) as any;
    const audioUrl = String(body?.audioDataUri || '');
    if (!audioUrl) return false;
    const queued = await fetch(`${STREAMWEAVER_URL}/api/tts/current?tenant=${encodeURIComponent(tenantId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': secret },
      body: JSON.stringify({ audioUrl, text }),
    });
    return queued.ok;
  } catch (error) {
    console.warn('[Stella] speech queue failed', error);
    return false;
  }
}
