import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GAME_HUB_CATALOG, getGameHubGame } from '@/lib/game-hub-registry';
import { canonicalPlayerCommands, canonicalStreamerCommands } from '@/lib/game-hub-commands';
import { getGameHubGameStats } from '@/lib/game-hub-state';
import { readAppState } from '@/lib/volume-store';
import { GameHubControlPanel } from '@/components/game-hub-control-panel';
import { GameHubPlayPanel } from '@/components/game-hub-play-panel';

export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return GAME_HUB_CATALOG.map((game) => ({ gameId: game.id }));
}

export default async function GameHubDetailPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const game = getGameHubGame(gameId);
  if (!game) notFound();
  const state = await readAppState();
  const stats = getGameHubGameStats(state, game.id);
  const playerCommands = canonicalPlayerCommands(game);
  const streamerCommands = canonicalStreamerCommands(game);

  return (
    <main className="cosmic-page max-w-6xl" data-workspace-main>
      <section className="cosmic-card space-y-5">
        <div>
          <div className="cosmic-status">Games Hub · {game.category}</div>
          <h1 className="mt-3 font-headline text-3xl font-bold text-white md:text-4xl">{game.name}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{game.description}</p>
        </div>

        <GameHubPlayPanel game={game} />

        <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
          <h2 className="font-headline text-xl text-white">Rules</h2>
          <p className="mt-2 text-sm leading-7 text-slate-300">{game.howToPlay}</p>
          <p className="mt-3 text-xs leading-5 text-slate-500">Game score belongs to this game’s leaderboard. Games Points are a separate spendable Games Hub wallet and are not SPMT XP.</p>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
            <h2 className="font-headline text-lg text-white">Player commands</h2>
            <div className="mt-3 space-y-2">
              {playerCommands.map((command) => (
                <div key={`${command.trigger}-${command.description}`} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                  <code className="text-cyan-100">{command.trigger}</code>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{command.description}</p>
                </div>
              ))}
            </div>
            {game.chatSignals?.length ? <p className="mt-3 text-xs text-slate-500">Passive input: {game.chatSignals.join(', ')}.</p> : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
            <h2 className="font-headline text-lg text-white">Streamer commands</h2>
            <div className="mt-3 space-y-2">
              {streamerCommands.map((command) => (
                <div key={command.trigger} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                  <code className="text-emerald-100">{command.trigger}</code>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{command.description}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">The app controls and chat controls update the same per-channel ACTIVE/STOPPED scope.</p>
          </div>
        </section>

        <GameHubControlPanel gameId={game.id} gameName={game.name} />

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
            <div className="flex items-end justify-between gap-3">
              <div><h2 className="font-headline text-lg text-white">Leaderboard</h2><p className="mt-1 text-xs text-slate-500">Per-game score, independent from Games Points.</p></div>
              <span className="text-xs text-slate-500">Top {Math.min(50, stats.leaderboard.length)}</span>
            </div>
            <div className="mt-3 space-y-2">
              {stats.leaderboard.length ? stats.leaderboard.slice(0, 20).map((player, index) => (
                <div key={player.id} className="grid grid-cols-[28px_1fr_auto] items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 text-sm">
                  <span className="text-xs font-black text-slate-500">#{index + 1}</span>
                  <div className="min-w-0"><strong className="block truncate text-white">{player.displayName || player.username}</strong><span className="text-[10px] text-slate-500">{player.wins} wins · {player.plays} plays</span></div>
                  <strong className="text-cyan-100">{player.score}</strong>
                </div>
              )) : <p className="text-sm text-slate-500">No players have scored in this game yet.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
            <div className="flex items-end justify-between gap-3">
              <div><h2 className="font-headline text-lg text-white">Players</h2><p className="mt-1 text-xs text-slate-500">Joined players and their current Games Points wallet.</p></div>
              <span className="text-xs text-slate-500">{stats.players.length} shown</span>
            </div>
            <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
              {stats.players.length ? stats.players.map((player) => (
                <div key={player.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 text-sm">
                  <div className="min-w-0"><strong className="block truncate text-white">{player.displayName || player.username}</strong><span className="text-[10px] text-slate-500">Game score {player.score}</span></div>
                  <span className="rounded-full bg-violet-300/10 px-2 py-1 text-[10px] font-bold text-violet-100">{player.gamePointsBalance} GP</span>
                </div>
              )) : <p className="text-sm text-slate-500">No players have joined this game yet.</p>}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
          <h2 className="font-headline text-lg text-white">Game surface</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Interaction model</dt><dd className="text-slate-200">{game.runtime}</dd></div>
            <div><dt className="text-slate-500">Overlay fit</dt><dd className="text-slate-200">{game.overlayAspect}</dd></div>
          </dl>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link href="/game-overlays" className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-5 py-2.5 text-sm font-bold text-cyan-100 no-underline">Add to an overlay</Link>
          <Link href="/games" className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-slate-200 no-underline">Back to catalog</Link>
        </div>
      </section>
    </main>
  );
}
