'use client';

export function BingoTranscriptControl({ channel }: { channel: string }) {
  return <section className="rounded-3xl border border-white/10 p-5" aria-label="Bingo transcription paused">
    <h2 className="text-xl font-bold">Bingo transcription is off</h2>
    <p className="mt-2 text-sm text-slate-300">Microphone transcription for #{channel} is paused while a free or inexpensive option is evaluated. Stream and tab listening have been removed.</p>
  </section>;
}
