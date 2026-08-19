import Link from 'next/link';
import { GAME_HUB_CATALOG } from '@/lib/game-hub-registry';
import { canonicalCommandSummary } from '@/lib/game-hub-commands';

export default function GamesHubPage() {
  return (
    <main className="cosmic-page max-w-7xl" data-workspace-main>
      <section className="cosmic-hero">
        <div className="cosmic-card space-y-4">
          <div className="cosmic-status">Space Mountain Games Hub</div>
          <h1 className="cosmic-title">One chat. Twenty equal game slots.</h1>
          <p className="cosmic-subtitle">
            One SpaceMountainLive listener, one <code>spmt</code> command language, modular overlays, per-game leaderboards and a spendable Games Points wallet separate from SPMT XP. No game is designated flagship by the platform.
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-slate-300">
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5">{GAME_HUB_CATALOG.length} peer games</span>
            <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1.5">spmt prefix only</span>
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5">ACTIVE scope per channel</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/game-overlays" className="rounded-full bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--accent)))] px-5 py-2.5 text-sm font-bold text-slate-950 no-underline">Build game overlays</Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {GAME_HUB_CATALOG.map((game) => (
          <article key={game.id} className="cosmic-card flex min-h-64 flex-col gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{game.category} · {game.runtime}</div>
              <h2 className="mt-1 font-headline text-xl text-white">{game.name}</h2>
            </div>
            <p className="text-sm leading-6 text-slate-300">{game.description}</p>
            <div className="rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-xs leading-5 text-slate-400">
              {canonicalCommandSummary(game)}
            </div>
            <div className="mt-auto">
              <Link href={`/games/${game.id}`} className="inline-block rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-100 no-underline">Rules, players & leaderboard</Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
