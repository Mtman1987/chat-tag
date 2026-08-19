import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/auth';
import { updateAppState } from '@/lib/volume-store';
import { commonBingoPhrases } from '@/lib/bingo-data';
import { BINGO_CENTER_INDEX, BINGO_CENTER_PLACEHOLDER, resetPersonalBingoProgress } from '@/lib/bingo-game';

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function generateWithGemini(): Promise<string[] | null> {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: 'Generate exactly 24 short bingo phrases (2-5 words each) for a Twitch community bingo card. They should be funny, relatable things that happen on Twitch streams like "Streamer rage quits", "Chat spams F", "Pet on camera", "Mic left on mute". Make them varied and entertaining. Return ONLY a JSON array of 24 strings, no other text.'
            }]
          }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 500 }
        }),
      }
    );

    if (!res.ok) {
      console.error('[Bingo AI] Gemini API error:', res.status);
      return null;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    const phrases: string[] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(phrases) || phrases.length < 24) return null;

    return phrases.slice(0, 24).map((phrase: string) => String(phrase).trim()).filter(Boolean);
  } catch (error: any) {
    console.error('[Bingo AI] Generation failed:', error.message);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAdminRequest(req);
  if (!auth.ok) return auth.response;

  try {
    const generated = await generateWithGemini();
    const aiGenerated = Boolean(generated && generated.length >= 24);
    const phrases = aiGenerated
      ? generated!.slice(0, 24)
      : shuffleArray(commonBingoPhrases).slice(0, 24);

    if (!aiGenerated) {
      console.log('[Bingo] AI generation failed or insufficient, using shuffled defaults');
    }

    phrases.splice(BINGO_CENTER_INDEX, 0, BINGO_CENTER_PLACEHOLDER);

    await updateAppState((state) => {
      state.bingoCards.current_user = {
        phrases,
        updatedAt: new Date().toISOString(),
        generatedBy: aiGenerated ? 'ai' : 'defaults',
      };
      resetPersonalBingoProgress(state);
    });

    return NextResponse.json({ success: true, phrases, aiGenerated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
