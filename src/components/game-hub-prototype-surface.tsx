'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameHubGame } from '@/lib/game-hub-catalog';

export type GameHubChatEvent = {
  id: string;
  at: string;
  channel: string;
  userId?: string;
  username: string;
  displayName: string;
  message: string;
  color?: string;
  badges?: Record<string, unknown>;
};

const COLORS: Record<string, string> = {
  red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308',
  purple: '#a855f7', orange: '#f97316', pink: '#ec4899', white: '#f8fafc',
  black: '#111827', cyan: '#06b6d4',
};
const TEAM_NAMES = ['red', 'blue', 'green', 'yellow'] as const;
const PHRASES = [
  'the stars are listening', 'chat controls the universe', 'one more game',
  'space mountain never sleeps', 'follow the cosmic duck', 'community power',
];
const PLANTS: Array<[RegExp, string]> = [
  [/\b(rose|flower|bloom)\b/i, '🌹'], [/\b(tree|forest|oak)\b/i, '🌳'],
  [/\b(grass|garden|leaf)\b/i, '🌿'], [/\b(sunflower|sun)\b/i, '🌻'],
  [/\b(cactus|desert)\b/i, '🌵'], [/\b(mushroom|fungus)\b/i, '🍄'],
];
const STOP_WORDS = new Set(['this', 'that', 'with', 'have', 'from', 'your', 'just', 'they', 'what', 'when', 'then', 'there', 'here', 'about', 'spmt']);

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function cleanCommand(message: string) {
  return message.trim().toLowerCase();
}

function spmtArgs(message: string, ...keys: string[]): string[] | null {
  const match = cleanCommand(message).match(/^!?@?spmt(?:\s+|$)(.*)$/i);
  if (!match) return null;
  const parts = String(match[1] || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length || !keys.includes(parts[0])) return null;
  return parts.slice(1);
}

function isSpmtCommand(message: string) {
  return /^!?@?spmt(?:\s|$)/i.test(message.trim());
}

function gameWords(message: string) {
  return (message.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []).filter((word) => !STOP_WORDS.has(word));
}

function emojiTokens(message: string): string[] {
  try { return message.match(/\p{Extended_Pictographic}/gu) || []; } catch { return []; }
}

type ChatWarsTeamTile = 'gray' | 'red' | 'blue' | 'green' | 'yellow';
type ChatWarsChannelSnapshot = {
  channel: string;
  territory: number;
  phase: string;
  activeHalf: number;
  updatedAt: string;
  width: number;
  height: number;
  tiles: ChatWarsTeamTile[];
  counts: Record<'red' | 'blue' | 'green' | 'yellow', number>;
  totalCounts: Record<'red' | 'blue' | 'green' | 'yellow', number>;
  leaderboard: Array<{ username: string; team: string; level: number; score: number }>;
};
type ChatWarsSnapshot = {
  width: number;
  height: number;
  tiles: ChatWarsTeamTile[];
  counts: Record<'red' | 'blue' | 'green' | 'yellow', number>;
  leaderboard: Array<{ username: string; team: string; level: number; score: number }>;
  battle?: null | {
    battleId: string;
    channels: ChatWarsChannelSnapshot[];
    createdBy: string;
    createdAt: string;
    active: boolean;
  };
};

function ChatWarsBoard({ channel, gridOnly = false }: { channel: string; gridOnly?: boolean }) {
  const [snapshot, setSnapshot] = useState<ChatWarsSnapshot | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/game-hub/chat-wars?channel=${encodeURIComponent(channel)}`, { cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json() as ChatWarsSnapshot;
        if (!cancelled) setSnapshot(body);
      } catch {}
    };
    void load();
    const timer = window.setInterval(() => void load(), 1500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [channel]);

  if (!snapshot) return <div className="h-full w-full bg-slate-950" />;

  const renderGrid = (entry: Pick<ChatWarsChannelSnapshot, 'width' | 'height' | 'tiles'>, label: string) => (
    <div aria-label={label} className="grid h-full w-full gap-px overflow-hidden bg-slate-800 p-px" style={{ gridTemplateColumns: `repeat(${entry.width}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${entry.height}, minmax(0, 1fr))` }}>
      {entry.tiles.map((team, index) => <span key={index} className="min-h-0 min-w-0" style={{ background: team === 'gray' ? '#111827' : COLORS[team] }} />)}
    </div>
  );

  const battleChannels = snapshot.battle?.active ? snapshot.battle.channels : [];
  if (battleChannels.length >= 2) {
    const columns = battleChannels.length <= 2 ? 'grid-cols-2' : 'grid-cols-2';
    return <div className={`grid h-full w-full ${columns} gap-2 bg-slate-950 p-2`}>
      {battleChannels.map((entry) => (
        <div key={entry.channel} className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-1 overflow-hidden rounded border border-white/15 bg-slate-950">
          <div className="truncate px-2 pt-1 text-center text-[clamp(8px,1.6vw,14px)] font-black uppercase tracking-wide text-cyan-100">@{entry.channel}</div>
          <div className="min-h-0">{renderGrid(entry, `Chat Wars territory grid for ${entry.channel}`)}</div>
          <div className="flex items-center justify-between gap-2 px-2 pb-1 text-[clamp(7px,1.2vw,10px)] font-bold uppercase text-white/70">
            <span>{entry.territory} tiles</span>
            <span>half {entry.activeHalf} · {entry.phase.replace('-', ' ')}</span>
          </div>
        </div>
      ))}
    </div>;
  }

  const grid = renderGrid(snapshot, 'Chat Wars territory grid');
  if (gridOnly) return grid;
  const total = Math.max(1, snapshot.width * snapshot.height);
  return <div className="grid aspect-[4/5] w-full max-w-[420px] grid-rows-[1fr_auto] gap-3">
    {grid}
    <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-black uppercase">
      {TEAM_NAMES.map((team) => <span key={team} style={{ color: COLORS[team] }}>{team} {Math.round((snapshot.counts[team] / total) * 100)}%</span>)}
    </div>
  </div>;
}

type MosaicSnapshot = {
  artwork: null | {
    id: string;
    theme: string;
    status: string;
    activeBoard: number;
    viewMode: 'board' | 'all';
    target: string[];
    painted: string[];
    width: number;
    height: number;
    progress: number;
    total: number;
  };
  queueLength: number;
  generation?: null | {
    theme: string;
    status: 'pending' | 'generating' | 'failed';
    error: string;
    attempts: number;
    maxAttempts: number;
    retryAt: string;
  };
};

const MOSAIC_HEX: Record<string, string> = {
  R: '#ef4444', B: '#3b82f6', G: '#22c55e', Y: '#eab308', P: '#a855f7',
  O: '#f97316', PK: '#ec4899', W: '#f8fafc', K: '#111827', C: '#06b6d4',
};

function PixelBoard({ channel, gridOnly = false }: { channel: string; gridOnly?: boolean }) {
  const [snapshot, setSnapshot] = useState<MosaicSnapshot>({ artwork: null, queueLength: 0 });
  const generationRunning = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/game-hub/mosaic?channel=${encodeURIComponent(channel)}`, { cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json() as MosaicSnapshot;
        if (!cancelled) setSnapshot(body);
        const canGenerate = body.queueLength > 0 && (!body.artwork || body.artwork.status === 'completed' || body.artwork.status === 'archived');
        if (canGenerate && !generationRunning.current) {
          generationRunning.current = true;
          void fetch('/api/game-hub/mosaic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel }),
          }).finally(() => { generationRunning.current = false; });
        }
      } catch {}
    };
    void load();
    const timer = window.setInterval(() => void load(), 1500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [channel]);

  const artwork = snapshot.artwork;
  const artworkId = artwork?.id;
  const artworkStatus = artwork?.status;
  useEffect(() => {
    if (!artworkId || artworkStatus !== 'active') return;
    const heartbeat = () => void fetch('/api/game-hub/mosaic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, action: 'heartbeat' }),
    }).catch(() => {});
    heartbeat();
    const timer = window.setInterval(heartbeat, 30_000);
    return () => window.clearInterval(timer);
  }, [artworkId, artworkStatus, channel]);

  if (!artwork) {
    const generation = snapshot.generation;
    const exhausted = generation?.status === 'failed' && generation.attempts >= generation.maxAttempts;
    const status = exhausted
      ? `Could not create “${generation.theme}” · try !mosaic ${generation.theme} again`
      : generation
        ? `${generation.status === 'failed' ? 'Retrying' : 'Creating'} “${generation.theme}”…`
        : 'Request a theme with !mosaic owl';
    return <div className="grid h-full w-full place-items-center bg-slate-950 text-center text-cyan-100"><div><div className="text-lg font-black">NEBULA MOSAIC</div><div className="mt-2 text-xs text-white/55">{status}</div></div></div>;
  }

  if (artwork.viewMode === 'all') {
    return <div aria-label={`Nebula Mosaic ${artwork.theme} combined progress`} className="grid h-full w-full gap-px overflow-hidden bg-slate-700 p-px" style={{ gridTemplateColumns: `repeat(${artwork.width}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${artwork.height}, minmax(0, 1fr))` }}>{artwork.target.map((target, index) => {
      const painted = artwork.painted[index];
      return <span key={index} className="min-h-0 min-w-0 bg-slate-950" style={painted ? { background: MOSAIC_HEX[painted] } : undefined} />;
    })}</div>;
  }

  const columns = Array.from({ length: 20 }, (_, index) => String.fromCharCode(65 + index));
  const rows = Array.from({ length: 25 }, (_, index) => index + 1);
  return <div className={gridOnly ? 'h-full w-full bg-slate-950' : 'aspect-[4/5] w-full max-w-[420px] bg-slate-950'}>
    <div aria-label={`Nebula Mosaic ${artwork.theme} board ${artwork.activeBoard}`} className="grid h-full w-full gap-px overflow-hidden bg-slate-700 p-px" style={{ gridTemplateColumns: 'minmax(14px,.55fr) repeat(20,minmax(0,1fr))', gridTemplateRows: 'minmax(12px,.48fr) repeat(25,minmax(0,1fr))' }}>
      <span className="bg-slate-950" />
      {columns.map((label) => <span key={`column-${label}`} className="grid min-h-0 min-w-0 place-items-center bg-slate-900 text-[clamp(6px,1.4vw,11px)] font-black text-cyan-100">{label}</span>)}
      {rows.flatMap((row, rowIndex) => [
        <span key={`row-${row}`} className="grid min-h-0 min-w-0 place-items-center bg-slate-900 text-[clamp(6px,1.25vw,10px)] font-black text-cyan-100">{row}</span>,
        ...columns.map((_, columnIndex) => {
          const index = rowIndex * 20 + columnIndex;
          const target = artwork.target[index];
          const painted = artwork.painted[index];
          return <span key={`cell-${index}`} className="grid min-h-0 min-w-0 place-items-center bg-slate-950 text-[clamp(6px,1.45vw,11px)] font-black leading-none" style={painted ? { background: MOSAIC_HEX[painted], color: painted === 'K' ? '#94a3b8' : '#07111f' } : { color: MOSAIC_HEX[target] }}>{painted ? '' : target}</span>;
        }),
      ])}
    </div>
  </div>;
}

type TreasureSnapshot = { width: number; height: number; cells: Array<{ coordinate: string; state: 'hidden' | 'pending' | 'cold' | 'warm' | 'hot' | 'boiling' | 'treasure' }>; foundCount: number; treasureCount: number; complete: boolean; challenge: null | { coordinate: string; clue: 'cold' | 'warm' | 'hot' | 'boiling'; question: string; wrongGuesses: number }; turn: { current: null | { username: string; skips: number }; queue: Array<{ username: string; skips: number }>; expiresAt: string | null; kickVotes: number } };

function TreasureBoard({ channel, gridOnly = false }: { channel: string; gridOnly?: boolean }) {
  const [snapshot, setSnapshot] = useState<TreasureSnapshot | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/game-hub/treasure-hunt?channel=${encodeURIComponent(channel)}`, { cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json() as TreasureSnapshot;
        if (!cancelled) setSnapshot(body);
      } catch {}
    };
    void load();
    const timer = window.setInterval(() => void load(), 1500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [channel]);
  if (!snapshot) return <div className="h-full w-full bg-slate-950" />;
  const columns = Array.from({ length: snapshot.width }, (_, index) => String.fromCharCode(65 + index));
  const rows = Array.from({ length: snapshot.height }, (_, index) => index + 1);
  const board = <div aria-label="Treasure Hunt grid" className="grid h-full w-full gap-px overflow-hidden bg-cyan-950 p-px" style={{ gridTemplateColumns: 'minmax(14px,.55fr) repeat(20,minmax(0,1fr))', gridTemplateRows: 'minmax(12px,.48fr) repeat(25,minmax(0,1fr))' }}>
    <span className="bg-slate-950" />
    {columns.map((label) => <span key={`treasure-column-${label}`} className="grid min-h-0 min-w-0 place-items-center bg-slate-900 text-[clamp(6px,1.4vw,11px)] font-black text-cyan-100">{label}</span>)}
    {rows.flatMap((row, rowIndex) => [
      <span key={`treasure-row-${row}`} className="grid min-h-0 min-w-0 place-items-center bg-slate-900 text-[clamp(6px,1.25vw,10px)] font-black text-cyan-100">{row}</span>,
      ...columns.map((_, columnIndex) => {
        const cell = snapshot.cells[rowIndex * snapshot.width + columnIndex];
        const text = cell.state === 'treasure' ? '◆' : cell.state === 'boiling' ? '🔥' : cell.state === 'hot' ? 'H' : cell.state === 'warm' ? 'W' : cell.state === 'cold' ? 'C' : cell.state === 'pending' ? '?' : '';
        const background = cell.state === 'treasure' ? '#facc15' : cell.state === 'boiling' ? '#ef4444' : cell.state === 'hot' ? '#fb7185' : cell.state === 'warm' ? '#fb923c' : cell.state === 'cold' ? '#38bdf8' : cell.state === 'pending' ? '#a78bfa' : '#0f172a';
        return <span key={cell.coordinate} title={cell.coordinate} className="grid min-h-0 min-w-0 place-items-center font-black leading-none text-slate-950" style={{ fontSize: 'clamp(5px,1.2vw,10px)', background }}>{text}</span>;
      }),
    ])}
  </div>;
  const seconds = snapshot.turn.expiresAt ? Math.max(0, Math.ceil((Date.parse(snapshot.turn.expiresAt) - Date.now()) / 1000)) : 0;
  const challenge = <div className="shrink-0 bg-slate-950/95 px-2 py-1 text-center text-[clamp(7px,1vw,10px)] leading-tight text-white"><b className="text-cyan-100">{snapshot.turn.current ? `${snapshot.turn.current.username} · ${seconds}s` : 'JOIN THE ROTATION'}</b>{snapshot.challenge ? <> · <b>{snapshot.challenge.coordinate} · {snapshot.challenge.clue.toUpperCase()}</b> · {snapshot.challenge.question} <span className="text-white/55">({snapshot.challenge.wrongGuesses}/3 misses)</span></> : <> · spmt treasure</>}</div>;
  if (gridOnly) return <div className="grid h-full w-full grid-rows-[minmax(0,1fr)_auto] bg-slate-950">{board}{challenge}</div>;
  return <div className="grid aspect-[4/5] w-full max-w-[520px] grid-rows-[auto_minmax(0,1fr)_auto] gap-2"><div className="text-xs">Treasures <b>{snapshot.foundCount}/{snapshot.treasureCount}</b> · Queue {snapshot.turn.queue.map((entry) => entry.username).join(' → ') || 'empty'}{snapshot.complete ? ' · BOARD COMPLETE' : ''}</div>{board}{challenge}</div>;
}

function WordChain({ events }: { events: GameHubChatEvent[] }) {
  const chain = useMemo(() => {
    const accepted: Array<{ user: string; word: string }> = [];
    const used = new Set<string>();
    let last = '';
    for (const event of events) {
      if (isSpmtCommand(event.message)) continue;
      const word = cleanCommand(event.message);
      if (!/^[a-z]{2,18}$/.test(word) || used.has(word)) continue;
      if (last && word[0] !== last[last.length - 1]) continue;
      used.add(word); last = word; accepted.push({ user: event.displayName, word });
    }
    return accepted;
  }, [events]);
  const last = chain.at(-1)?.word || 'start';
  return <div className="space-y-3"><div className="text-center"><div className="text-[10px] uppercase tracking-widest text-white/45">Next letter</div><div className="text-5xl font-black uppercase">{last === 'start' ? 'A' : last.at(-1)}</div></div><div className="flex flex-wrap justify-center gap-1">{chain.slice(-8).map((entry, index) => <span key={`${entry.word}-${index}`} className="rounded-full bg-white/10 px-2 py-1 text-[10px]">{entry.word}</span>)}</div></div>;
}

function WordStorm({ events }: { events: GameHubChatEvent[] }) {
  const words = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) {
      if (isSpmtCommand(event.message)) continue;
      for (const word of gameWords(event.message)) counts.set(word, (counts.get(word) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16);
  }, [events]);
  return <div className="flex min-h-36 flex-wrap items-center justify-center gap-3">{words.length ? words.map(([word, count]) => <span key={word} style={{ fontSize: `${12 + Math.min(30, count * 5)}px` }} className="font-black text-cyan-100 drop-shadow-[0_0_12px_rgba(34,211,238,.45)]">{word}</span>) : <span className="text-sm text-white/40">Chat to build the storm.</span>}</div>;
}

function PhraseGuess({ events, channel }: { events: GameHubChatEvent[]; channel: string }) {
  const day = new Date().toISOString().slice(0, 10);
  const phrase = PHRASES[hashText(`${channel}:${day}`) % PHRASES.length];
  const winner = events.find((event) => !isSpmtCommand(event.message) && cleanCommand(event.message) === phrase);
  const mask = phrase.split('').map((char) => char === ' ' ? '  ' : '_').join(' ');
  return <div className="grid min-h-36 place-items-center text-center"><div><div className="font-mono text-xl tracking-[.18em] text-cyan-100">{winner ? phrase.toUpperCase() : mask}</div><div className="mt-4 text-xs text-white/55">{winner ? `Solved by ${winner.displayName}!` : 'Guess the phrase in normal chat.'}</div></div></div>;
}

function RaceBoard({ events, chicken = false, broadcastOnly = false }: { events: GameHubChatEvent[]; chicken?: boolean; broadcastOnly?: boolean }) {
  const racers = useMemo(() => {
    const map = new Map<string, { name: string; pet: string; activity: number; seed: number }>();
    for (const event of events) {
      const args = chicken
        ? spmtArgs(event.message, 'chicken', 'chickenroyale', 'royale')
        : spmtArgs(event.message, 'petrace', 'pets');
      if (args && args[0] !== 'leave' && args[0] !== 'start' && args[0] !== 'stop' && !map.has(event.username)) {
        const petName = chicken ? '' : String(args[0] || '');
        map.set(event.username, {
          name: event.displayName,
          pet: chicken ? '🐔' : ({ dog: '🐕', cat: '🐈', rabbit: '🐇', turtle: '🐢', hamster: '🐹' } as Record<string, string>)[petName] || ['🐕','🐈','🐇','🐢','🐹'][hashText(event.username) % 5],
          activity: 0,
          seed: hashText(event.username) % 20,
        });
      }
      const racer = map.get(event.username);
      if (racer && !isSpmtCommand(event.message)) racer.activity += 1;
    }
    return [...map.values()].map((racer) => ({ ...racer, progress: Math.min(100, racer.seed + racer.activity * (chicken ? 8 : 11)) })).sort((a, b) => b.progress - a.progress).slice(0, 10);
  }, [events, chicken]);
  return <div className="space-y-2">{racers.length ? racers.map((racer) => <div key={racer.name} className="grid grid-cols-[28px_78px_1fr] items-center gap-2 text-xs"><span>{racer.pet}</span><span className="truncate">{racer.name}</span><span className="h-3 overflow-hidden rounded-full bg-white/10"><i className="block h-full rounded-full bg-cyan-300" style={{ width: `${racer.progress}%` }} /></span></div>) : broadcastOnly ? null : <div className="text-sm text-white/40">Use {chicken ? 'spmt chicken' : 'spmt petrace'} to enter.</div>}</div>;
}

export function GameHubPrototypeSurface({ game, events, channel, broadcastOnly = false }: { game: GameHubGame; events: GameHubChatEvent[]; channel: string; broadcastOnly?: boolean }) {
  const recent = events.slice(-60);
  const passive = recent.filter((event) => !isSpmtCommand(event.message));
  const content = useMemo(() => {
    if (game.id === 'chaosmode') {
      const special = recent.filter((event) => {
        const args = spmtArgs(event.message, 'chaos', 'chaosmode');
        return Boolean(args && /^(explode|glitch|portal|shake)$/.test(args[0] || ''));
      }).at(-1);
      const level = Math.min(100, passive.length * 4);
      return <div className="grid min-h-36 place-items-center text-center"><div><div className="text-6xl">{special ? '💥' : level > 70 ? '🌀' : '⚡'}</div><div className="mt-2 text-2xl font-black">CHAOS {level}%</div>{(special || !broadcastOnly) && <div className="mt-1 text-[10px] text-white/50">{special ? `${special.displayName}: ${special.message}` : 'Every normal chat message raises the chaos.'}</div>}</div></div>;
    }
    if (game.id === 'chatgarden') {
      const plants = passive.flatMap((event) => PLANTS.filter(([pattern]) => pattern.test(event.message)).map(([, icon]) => ({ icon, user: event.displayName }))).slice(-24);
      return <div className="flex min-h-36 flex-wrap content-end items-end justify-center gap-2 rounded-xl bg-gradient-to-b from-sky-950/40 to-emerald-950/40 p-3">{plants.length ? plants.map((plant, index) => <span key={`${plant.user}-${index}`} className="text-3xl" title={plant.user}>{plant.icon}</span>) : broadcastOnly ? null : <span className="self-center text-sm text-white/40">Mention flowers, trees, grass or mushrooms.</span>}</div>;
    }
    if (game.id === 'chatwars') return <ChatWarsBoard channel={channel} gridOnly={broadcastOnly} />;
    if (game.id === 'chickenroyale') return <RaceBoard events={recent} chicken broadcastOnly={broadcastOnly} />;
    if (game.id === 'petrace') return <RaceBoard events={recent} broadcastOnly={broadcastOnly} />;
    if (game.id === 'pixelbattle') return <PixelBoard channel={channel} gridOnly={broadcastOnly} />;
    if (game.id === 'treasurehunt') return <TreasureBoard channel={channel} gridOnly={broadcastOnly} />;
    if (game.id === 'wordchain') return <WordChain events={recent} />;
    if (game.id === 'wordstorm') return <WordStorm events={recent} />;
    if (game.id === 'phraseguess') return <PhraseGuess events={recent} channel={channel} />;
    if (game.id === 'emojirain') {
      const emojis = passive.flatMap((event) => emojiTokens(event.message).map((emoji) => ({ emoji, id: `${event.id}-${emoji}` }))).slice(-40);
      return <div className="flex min-h-36 flex-wrap items-center justify-center gap-2 overflow-hidden">{emojis.length ? emojis.map((item, index) => <span key={`${item.id}-${index}`} className="animate-bounce text-3xl" style={{ animationDelay: `${(index % 8) * 90}ms` }}>{item.emoji}</span>) : broadcastOnly ? null : <span className="text-sm text-white/40">Send emojis to make it rain.</span>}</div>;
    }
    if (game.id === 'emojitower') {
      const drops = recent.filter((event) => spmtArgs(event.message, 'tower', 'emojitower')?.[0] === 'drop').slice(-18);
      return <div className="flex min-h-40 flex-col-reverse items-center justify-start gap-0.5">{drops.length ? drops.map((event, index) => <span key={event.id} className="grid h-7 place-items-center rounded border border-white/15 bg-violet-400/15 text-xl" style={{ width: `${50 + (hashText(event.id) % 70)}px`, transform: `translateX(${(hashText(`${event.id}:x`) % 31) - 15}px)` }}>{['🟪','🟦','🟩','🟨','🟥'][index % 5]}</span>) : broadcastOnly ? null : <span className="my-auto text-sm text-white/40">spmt tower drop stacks the next block.</span>}</div>;
    }
    if (game.id === 'dancingparade') {
      const dancers = new Map<string, GameHubChatEvent>();
      for (const event of recent) {
        const args = spmtArgs(event.message, 'parade', 'dancingparade');
        if (!args) continue;
        const action = args[0] || 'join';
        if (action === 'join' || action === 'dance') dancers.set(event.username, event);
        if (action === 'leave') dancers.delete(event.username);
      }
      return <div className="flex min-h-36 flex-wrap items-end justify-center gap-4">{dancers.size ? [...dancers.values()].map((event) => <div key={event.username} className="text-center"><div className="animate-bounce text-4xl">🕺</div><div className="text-[10px]">{event.displayName}</div></div>) : broadcastOnly ? null : <span className="self-center text-sm text-white/40">spmt parade to join.</span>}</div>;
    }
    if (game.id === 'colorsymphony') {
      const notes = passive.flatMap((event) => Object.keys(COLORS).filter((color) => new RegExp(`\\b${color}\\b`, 'i').test(event.message)).map((color) => ({ color, id: `${event.id}-${color}` }))).slice(-16);
      return <div className="flex min-h-36 items-center justify-center gap-2">{notes.length ? notes.map((note, index) => <span key={`${note.id}-${index}`} className="grid h-12 w-8 place-items-center rounded-full text-xl" style={{ background: COLORS[note.color], transform: `translateY(${(index % 4) * -8}px)` }}>♪</span>) : broadcastOnly ? null : <span className="text-sm text-white/40">Type color names to write the symphony.</span>}</div>;
    }
    if (game.id === 'rhythmpulse') {
      const bars = passive.slice(-20).map((event) => Math.min(100, 12 + event.message.length * 2 + emojiTokens(event.message).length * 12));
      return <div className="flex min-h-36 items-end justify-center gap-1">{bars.length ? bars.map((value, index) => <span key={`${passive[passive.length - bars.length + index]?.id}-${index}`} className="w-3 rounded-t bg-cyan-300/80" style={{ height: `${value}%`, minHeight: '8px' }} />) : broadcastOnly ? null : <span className="self-center text-sm text-white/40">Chat creates the beat.</span>}</div>;
    }
    return broadcastOnly ? null : <div className="grid min-h-36 place-items-center text-sm text-white/45">Live chat runtime connected.</div>;
  }, [broadcastOnly, channel, game.id, passive, recent]);

  return <section className={`h-full min-h-0 overflow-hidden text-white ${broadcastOnly ? 'grid w-full p-0' : 'p-4'}`}>{content}</section>;
}
