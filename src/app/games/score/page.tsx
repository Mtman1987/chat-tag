import Link from 'next/link';
import { getGameHubGame } from '@/lib/game-hub-registry';
import { getGameHubStore, normalizeGameHubChannel, resolveChannelGameIds } from '@/lib/game-hub-state';
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
  const store = getGameHubStore(state);
  const player = Object.values(store.players || {}).find((candidate) =>
    normalizeGameHubChannel(candidate.username) === playerLogin
  );

  const rows = activeGameIds.map((gameId) => {
    const game = getGameHubGame(gameId);
    const membership = player?.joinedGames?.[gameId];
    return game ? {
      game,
      joined: Boolean(membership?.active),
      score: Number(membership?.score || 0),
      wins: Number(membership?.wins || 0),
      plays: Number(membership?.plays || 0),
      lastActiveAt: membership?.lastActiveAt || null,
    } : null;
  }).filter(Boolean);

  return (
    <main className="cosmic-page max-w-5xl" data-workspace-main>
      <section className="cosmic-card space-y-5">
        <div>
          <div className="cosmic-status">Games Hub · Active stats</div>
          <h1 className="mt-3 font-headline text-3xl font-bold text-white">
            {playerLogin ? `${player?.displayName || playerLogin} in #${channel || 'channel'}` : 'Player stats'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            This view intentionally shows only games currently ACTIVE in this streamer’s scope. Historical scores in stopped games remain stored and return when those games are activated again.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-violet-300/15 bg-violet-300/[0.06] p-4">
            <div className="text-xs uppercase tracking-[.16em] text-violet-200/60">Games Points</div>
            <strong className="mt-1 block text-3xl text-violet-100">{Number(player?.gamePointsBalance || 0)}</strong>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[.16em] text-slate-500">Lifetime earned</div>
            <strong className="mt-1 block text-3xl text-white">{Number(player?.lifetimeEarned || 0)}</strong>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[.16em] text-slate-500">Lifetime spent</div>
            <strong className="mt-1 block text-3xl text-white">{Number(player?.lifetimeSpent || 0)}</strong>
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-headline text-xl text-white">ACTIVE games</h2>
              <p className="mt-1 text-xs text-slate-500">{rows.length} game{rows.length === 1 ? '' : 's'} currently scoped to #{channel || '—'}.</p>
            </div>
          </div>
          {rows.length ? rows.map((row) => row && (
            <article key={row.game.id} className="grid gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 sm:grid-cols-[minmax(0,1fr)_repeat(3,90px)] sm:items-center">
              <div>
                <Link href={`/games/${row.game.id}`} className="font-headline text-lg font-bold text-white no-underline">{row.game.name}</Link>
                <p className="mt-1 text-xs text-slate-500">{row.joined ? 'Joined' : 'Not joined yet'}{row.lastActiveAt ? ` · last active ${new Date(row.lastActiveAt).toLocaleString()}` : ''}</p>
              </div>
              <div className="rounded-xl bg-white/[0.035] p-2 text-center"><span className="block text-[10px] uppercase text-slate-500">Score</span><strong className="text-cyan-100">{row.score}</strong></div>
              <div className="rounded-xl bg-white/[0.035] p-2 text-center"><span className="block text-[10px] uppercase text-slate-500">Wins</span><strong className="text-emerald-100">{row.wins}</strong></div>
              <div className="rounded-xl bg-white/[0.035] p-2 text-center"><span className="block text-[10px] uppercase text-slate-500">Plays</span><strong className="text-white">{row.plays}</strong></div>
            </article>
          )) : <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-slate-400">No Games Hub games are currently ACTIVE for this channel.</div>}
        </section>

        <div className="flex flex-wrap gap-3">
          {channel && <Link href={`/games/rules?channel=${encodeURIComponent(channel)}`} className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-5 py-2.5 text-sm font-bold text-cyan-100 no-underline">Rules + commands</Link>}
          <Link href="/games" className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-slate-200 no-underline">Games Hub</Link>
        </div>
      </section>
    </main>
  );
}
