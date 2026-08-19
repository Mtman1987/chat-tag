import Link from 'next/link';
import { GAME_HUB_CATALOG } from '@/lib/game-hub-registry';
import {
  allPlayedGameIds,
  getGamesPointsStanding,
  getPlayerGameSnapshots,
  ordinal,
} from '@/lib/game-hub-chat-summary';
import { normalizeGameHubChannel } from '@/lib/game-hub-state';
import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export default async function GamesHubLeaderProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string }>;
}) {
  const query = await searchParams;
  const playerLogin = normalizeGameHubChannel(query.player);
  const state = await readAppState();
  const standing = getGamesPointsStanding(state, undefined, playerLogin);
  const playedIds = new Set(allPlayedGameIds(state, undefined, playerLogin));
  const rows = getPlayerGameSnapshots(
    state,
    GAME_HUB_CATALOG.map((game) => game.id),
    { username: playerLogin },
  );

  return (
    <main className="cosmic-page max-w-6xl" data-workspace-main>
      <section className="cosmic-card space-y-6">
        <div>
          <div className="cosmic-status">Games Hub · Player profile</div>
          <h1 className="mt-3 font-headline text-3xl font-bold text-white">
            {standing?.displayName || playerLogin || 'Games Hub player'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            This is the all-games profile behind <code className="text-cyan-100">spmt leader</code>. Unlike <code className="text-cyan-100">spmt score</code>, it is not limited to one streamer’s ACTIVE scope.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-violet-300/15 bg-violet-300/[0.06] p-4">
            <div className="text-xs uppercase tracking-[.16em] text-violet-200/60">Games Points</div>
            <strong className="mt-1 block text-3xl text-violet-100">{Number(standing?.balance || 0).toLocaleString()}</strong>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[.16em] text-slate-500">Points rank</div>
            <strong className="mt-1 block text-3xl text-white">{standing ? `#${standing.rank}` : '—'}</strong>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[.16em] text-slate-500">Games played</div>
            <strong className="mt-1 block text-3xl text-white">{playedIds.size}</strong>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[.16em] text-slate-500">Earned / spent</div>
            <strong className="mt-1 block text-xl text-white">{Number(standing?.lifetimeEarned || 0).toLocaleString()} / {Number(standing?.lifetimeSpent || 0).toLocaleString()}</strong>
          </div>
        </div>

        <section className="space-y-3">
          <div>
            <h2 className="font-headline text-xl text-white">All 20 games</h2>
            <p className="mt-1 text-xs text-slate-500">Played history is preserved even after leaving or when a streamer stops that game.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {rows.map((row) => (
              <article key={row.gameId} className={`rounded-2xl border p-4 ${row.joined ? 'border-white/10 bg-black/25' : 'border-white/5 bg-black/10 opacity-65'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/games/${row.gameId}`} className="font-headline text-lg font-bold text-white no-underline">{row.name}</Link>
                    <p className="mt-1 text-sm text-slate-300">{row.summary}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.035] px-3 py-2 text-center">
                    <span className="block text-[9px] uppercase text-slate-500">Rank</span>
                    <strong className="text-cyan-100">{row.rank ? ordinal(row.rank) : '—'}</strong>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  {row.active ? 'Currently joined' : row.joined ? 'Historical membership' : 'Not played yet'}
                </p>
              </article>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link href="/games/leaderboard" className="rounded-full border border-violet-300/20 bg-violet-300/10 px-5 py-2.5 text-sm font-bold text-violet-100 no-underline">Games Points leaderboard</Link>
          <Link href="/games" className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-slate-200 no-underline">Games Hub</Link>
        </div>
      </section>
    </main>
  );
}
