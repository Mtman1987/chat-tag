import { ExternalLink, MessageSquare } from 'lucide-react';

export default function MessagesPage() {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-5 md:px-8">
      <section className="flex h-[calc(100vh-13rem)] min-h-[38rem] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/65 shadow-2xl backdrop-blur-xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-white"><MessageSquare className="h-5 w-5 text-cyan-300" /> Commlink Messaging</h1>
            <p className="text-xs text-slate-400">Chat Tag uses the same saved ChatSpaces, Desks, identities, events, and replies as every SPMT app.</p>
          </div>
          <a className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-100 hover:bg-white/10" href="https://spmt.live/?view=commlink" target="_blank" rel="noopener noreferrer">
            Open full workspace <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </header>
        <iframe
          className="min-h-0 flex-1 border-0"
          src="https://spmt.live/commlink/?embedded=1"
          title="SPMT Commlink messaging workspace"
          allow="microphone; autoplay; clipboard-write"
        />
      </section>
    </main>
  );
}
