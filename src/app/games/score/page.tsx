import Link from 'next/link';
import {
  getGamesPointsStanding,
  getPlayerGameSnapshots,
  ordinal,
} from '@/lib/game-hub-chat-summary';
import { normalizeGameHubChannel, resolveChannelGameIds } from '@/lib/game-hub-state';
import { readAppState } from '@/lib/volume-store';

export const dynamic = 'force-dynamic';

export default async function GamesHubScorePage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; player?: string }>;
}) {
  const query = await searchParams;
  const channel = normalizeGameHubChannel(query.channel);
  const playerLogin = normalizeGameHubChannel(query.player);
  const state = await readAppState();
  const activeGameIds = channel ? resolveChannelGameIds(state, channel) : [];
  const standing = getGamesPointsStanding(state, undefined, playerLogin);
  const rows = getPlayerGameSnapshots(state, activeGameIds, { username: playerLogin });

  return (
    <main className="cosmic-page max-w-5xl" data-workspace-main>
      <section className="cosmic-card space-y-5">
        <div>
          <div className="cosmic-status">Games Hub · Active stats</div>
          <h1 className="mt-3 font-headline text-3xl font-bold text-white">
            {playerLogin ? `${standing?.displayName || playerLogin} in #${channel || 'channel'}` : 'Player stats'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            This view intentionally shows only games currently ACTIVE in this streamer’s scope. Historical scores in stopped games remain stored and return when those games are activated again.
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
            <div className="text-xs uppercase tracking-[.16em] text-slate-500">Lifetime earned</div>
            <strong className="mt-1 block text-3xl text-white">{Number(standing?.lifetimeEarned || 0).toLocaleString()}</strong>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[.16em] text-slate-500">Lifetime spent</div>
            <strong className="mt-1 block text-3xl text-white">{Number(standing?.lifetimeSpent || 0).toLocaleString()}</strong>
          </div>
        </div>

        <section className="space-y-3">
          <div>
            <h2 className="font-headline text-xl text-white">ACTIVE games</h2>
            <p className="mt-1 text-xs text-slate-500">{rows.length} game{rows.length === 1 ? '' : 's'} currently scoped to #{channel || '—'}.</p>
          </div>
          {rows.length ? rows.map((row) => (
            <article key={row.gameId} className="grid gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 sm:grid-cols-[minmax(0,1fr)_110px] sm:items-center">
              <div>
                <Link href={`/games/${row.gameId}`} className="font-headline text-lg font-bold text-white no-underline">{row.name}</Link>
                <p className="mt-1 text-sm text-slate-300">{row.summary}</p>
                <p className="mt-1 text-xs text-slate-500">{row.active ? 'Joined and active' : row.joined ? 'History preserved; not currently joined' : 'Not joined yet'}</p>
              </div>
              <div className="rounded-xl bg-white/[0.035] p-3 text-center">
                <span className="block text-[10px] uppercase text-slate-500">Game rank</span>
                <strong className="text-lg text-cyan-100">{row.rank ? ordinal(row.rank) : '—'}</strong>
              </div>
            </article>
          )) : <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-slate-400">No Games Hub games are currently ACTIVE for this channel.</div>}
        </section>

        <div className="flex flex-wrap gap-3">
          {channel && <Link href={`/games/rules?channel=${encodeURIComponent(channel)}`} className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-5 py-2.5 text-sm font-bold text-cyan-100 no-underline">Rules + commands</Link>}
          {playerLogin && <Link href={`/games/leader?player=${encodeURIComponent(playerLogin)}`} className="rounded-full border border-violet-300/20 bg-violet-300/10 px-5 py-2.5 text-sm font-bold text-violet-100 no-underline">All game stats</Link>}
          <Link href="/games" className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-slate-200 no-underline">Games Hub</Link>
        </div>
      </section>
    </main>
  );
}
