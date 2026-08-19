import Link from 'next/link';
import { gamesPointsStandings } from '@/lib/game-hub-chat-summary';
import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export default async function GamesPointsLeaderboardPage() {
  const state = await readAppState();
  const leaders = gamesPointsStandings(state).slice(0, 100);

  return (
    <main className="cosmic-page max-w-5xl" data-workspace-main>
      <section className="cosmic-card space-y-5">
        <div>
          <div className="cosmic-status">Games Hub · Games Points</div>
          <h1 className="mt-3 font-headline text-3xl font-bold text-white">Games Points leaderboard</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Games Points are the Games Hub’s spendable currency and stay separate from SPMT XP. This is the full view behind <code className="text-cyan-100">spmt pleader</code>.
          </p>
        </div>

        <div className="space-y-2">
          {leaders.length ? leaders.map((entry) => (
            <article key={entry.id} className="grid gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 sm:grid-cols-[70px_minmax(0,1fr)_120px_120px] sm:items-center">
              <strong className="text-xl text-cyan-100">#{entry.rank}</strong>
              <div>
                <Link href={`/games/leader?player=${encodeURIComponent(entry.username)}`} className="font-headline text-lg font-bold text-white no-underline">
                  {entry.displayName || entry.username}
                </Link>
                <p className="mt-1 text-xs text-slate-500">@{entry.username}</p>
              </div>
              <div className="rounded-xl bg-violet-300/[0.06] p-2 text-center">
                <span className="block text-[9px] uppercase text-violet-200/60">Balance</span>
                <strong className="text-violet-100">{entry.balance.toLocaleString()}</strong>
              </div>
              <div className="rounded-xl bg-white/[0.035] p-2 text-center">
                <span className="block text-[9px] uppercase text-slate-500">Lifetime earned</span>
                <strong className="text-white">{entry.lifetimeEarned.toLocaleString()}</strong>
              </div>
            </article>
          )) : (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-slate-400">No Games Points have been recorded yet.</div>
          )}
        </div>

        <Link href="/games" className="inline-block rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-slate-200 no-underline">Games Hub</Link>
      </section>
    </main>
  );
}
