'use client';

import { useMemo } from 'react';
import type { GameHubGame } from '@/lib/game-hub-catalog';

export type GameHubChatEvent = {
  id: string;
  at: string;
  channel: string;
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

function TeamBoard({ events, gameKey, paint = false }: { events: GameHubChatEvent[]; gameKey: 'chatwars' | 'colorwars'; paint?: boolean }) {
  const state = useMemo(() => {
    const memberships = new Map<string, string>();
    const scores = Object.fromEntries(TEAM_NAMES.map((team) => [team, 0])) as Record<string, number>;
    for (const event of events) {
      const args = spmtArgs(event.message, gameKey, gameKey === 'chatwars' ? 'wars' : 'colors');
      const team = args ? TEAM_NAMES.find((name) => args[0] === name) : undefined;
      if (team) {
        memberships.set(event.username, team);
        scores[team] += paint ? 2 : 1;
        continue;
      }
      const current = memberships.get(event.username);
      if (current && !isSpmtCommand(event.message)) scores[current] += 1;
    }
    return { memberships, scores };
  }, [events, gameKey, paint]);
  const total = Math.max(1, Object.values(state.scores).reduce((sum, value) => sum + value, 0));
  return (
    <div className="grid gap-2">
      {TEAM_NAMES.map((team) => {
        const pct = Math.round((state.scores[team] / total) * 100);
        return <div key={team} className="grid grid-cols-[62px_1fr_42px] items-center gap-2 text-xs"><span className="capitalize">{team}</span><span className="h-3 overflow-hidden rounded-full bg-white/10"><i className="block h-full rounded-full" style={{ width: `${pct}%`, background: COLORS[team] }} /></span><b>{pct}%</b></div>;
      })}
      <div className="text-[10px] text-white/50">{state.memberships.size} team players · spmt {gameKey} red|blue|green|yellow</div>
    </div>
  );
}

function PixelBoard({ events }: { events: GameHubChatEvent[] }) {
  const cells = useMemo(() => {
    const next = Array.from({ length: 96 }, () => '');
    for (const event of events) {
      const args = spmtArgs(event.message, 'pixel', 'pixelbattle');
      if (!args) continue;
      const joined = args.join(' ');
      const match = joined.match(/^(red|blue|green|yellow|purple|orange|pink|white|black|cyan)\s+(\d{1,2})\s+(\d{1,2})$/);
      if (!match) continue;
      const x = Number(match[2]) % 12;
      const y = Number(match[3]) % 8;
      next[y * 12 + x] = match[1];
    }
    return next;
  }, [events]);
  return <div><div className="grid grid-cols-12 gap-px overflow-hidden rounded-lg bg-white/10 p-px">{cells.map((color, index) => <span key={index} className="aspect-square bg-slate-950/70" style={color ? { background: COLORS[color] } : undefined} />)}</div><div className="mt-2 text-[10px] text-white/50">spmt pixel red 10 5 · coordinates wrap to the shared 12×8 board</div></div>;
}

function TreasureBoard({ events, channel }: { events: GameHubChatEvent[]; channel: string }) {
  const day = new Date().toISOString().slice(0, 10);
  const treasures = useMemo(() => new Set(Array.from({ length: 5 }, (_, index) => hashText(`${channel}:${day}:${index}`) % 64)), [channel, day]);
  const dug = useMemo(() => {
    const cells = new Set<number>();
    for (const event of events) {
      const args = spmtArgs(event.message, 'treasure', 'treasurehunt');
      const match = String(args?.[0] || '').match(/^([a-h])([1-8])$/i);
      if (!match) continue;
      cells.add((Number(match[2]) - 1) * 8 + (match[1].toLowerCase().charCodeAt(0) - 97));
    }
    return cells;
  }, [events]);
  const found = [...dug].filter((cell) => treasures.has(cell)).length;
  return <div><div className="mb-2 text-xs">Treasures found <b>{found}/5</b></div><div className="grid grid-cols-8 gap-1">{Array.from({ length: 64 }, (_, index) => <span key={index} className={`grid aspect-square place-items-center rounded text-xs ${dug.has(index) ? 'bg-cyan-300/15' : 'bg-white/5'}`}>{dug.has(index) ? (treasures.has(index) ? '💎' : '·') : ''}</span>)}</div><div className="mt-2 text-[10px] text-white/50">Dig with spmt treasure B5 · map rotates daily per channel</div></div>;
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

function RaceBoard({ events, chicken = false }: { events: GameHubChatEvent[]; chicken?: boolean }) {
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
  return <div className="space-y-2">{racers.length ? racers.map((racer) => <div key={racer.name} className="grid grid-cols-[28px_78px_1fr] items-center gap-2 text-xs"><span>{racer.pet}</span><span className="truncate">{racer.name}</span><span className="h-3 overflow-hidden rounded-full bg-white/10"><i className="block h-full rounded-full bg-cyan-300" style={{ width: `${racer.progress}%` }} /></span></div>) : <div className="text-sm text-white/40">Use {chicken ? 'spmt chicken' : 'spmt petrace'} to enter.</div>}</div>;
}

export function GameHubPrototypeSurface({ game, events, channel }: { game: GameHubGame; events: GameHubChatEvent[]; channel: string }) {
  const recent = events.slice(-60);
  const passive = recent.filter((event) => !isSpmtCommand(event.message));
  const content = useMemo(() => {
    if (game.id === 'chaosmode') {
      const special = recent.filter((event) => {
        const args = spmtArgs(event.message, 'chaos', 'chaosmode');
        return Boolean(args && /^(explode|glitch|portal|shake)$/.test(args[0] || ''));
      }).at(-1);
      const level = Math.min(100, passive.length * 4);
      return <div className="grid min-h-36 place-items-center text-center"><div><div className="text-6xl">{special ? '💥' : level > 70 ? '🌀' : '⚡'}</div><div className="mt-2 text-2xl font-black">CHAOS {level}%</div><div className="mt-1 text-[10px] text-white/50">{special ? `${special.displayName}: ${special.message}` : 'Every normal chat message raises the chaos.'}</div></div></div>;
    }
    if (game.id === 'chatgarden') {
      const plants = passive.flatMap((event) => PLANTS.filter(([pattern]) => pattern.test(event.message)).map(([, icon]) => ({ icon, user: event.displayName }))).slice(-24);
      return <div className="flex min-h-36 flex-wrap content-end items-end justify-center gap-2 rounded-xl bg-gradient-to-b from-sky-950/40 to-emerald-950/40 p-3">{plants.length ? plants.map((plant, index) => <span key={`${plant.user}-${index}`} className="text-3xl" title={plant.user}>{plant.icon}</span>) : <span className="self-center text-sm text-white/40">Mention flowers, trees, grass or mushrooms.</span>}</div>;
    }
    if (game.id === 'chatwars') return <TeamBoard events={recent} gameKey="chatwars" />;
    if (game.id === 'colorwars') return <TeamBoard events={recent} gameKey="colorwars" paint />;
    if (game.id === 'chickenroyale') return <RaceBoard events={recent} chicken />;
    if (game.id === 'petrace') return <RaceBoard events={recent} />;
    if (game.id === 'pixelbattle') return <PixelBoard events={recent} />;
    if (game.id === 'treasurehunt') return <TreasureBoard events={recent} channel={channel} />;
    if (game.id === 'wordchain') return <WordChain events={recent} />;
    if (game.id === 'wordstorm') return <WordStorm events={recent} />;
    if (game.id === 'phraseguess') return <PhraseGuess events={recent} channel={channel} />;
    if (game.id === 'emojirain') {
      const emojis = passive.flatMap((event) => emojiTokens(event.message).map((emoji) => ({ emoji, id: `${event.id}-${emoji}` }))).slice(-40);
      return <div className="flex min-h-36 flex-wrap items-center justify-center gap-2 overflow-hidden">{emojis.length ? emojis.map((item, index) => <span key={`${item.id}-${index}`} className="animate-bounce text-3xl" style={{ animationDelay: `${(index % 8) * 90}ms` }}>{item.emoji}</span>) : <span className="text-sm text-white/40">Send emojis to make it rain.</span>}</div>;
    }
    if (game.id === 'emojitower') {
      const drops = recent.filter((event) => spmtArgs(event.message, 'tower', 'emojitower')?.[0] === 'drop').slice(-18);
      return <div className="flex min-h-40 flex-col-reverse items-center justify-start gap-0.5">{drops.length ? drops.map((event, index) => <span key={event.id} className="grid h-7 place-items-center rounded border border-white/15 bg-violet-400/15 text-xl" style={{ width: `${50 + (hashText(event.id) % 70)}px`, transform: `translateX(${(hashText(`${event.id}:x`) % 31) - 15}px)` }}>{['🟪','🟦','🟩','🟨','🟥'][index % 5]}</span>) : <span className="my-auto text-sm text-white/40">spmt tower drop stacks the next block.</span>}</div>;
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
      return <div className="flex min-h-36 flex-wrap items-end justify-center gap-4">{dancers.size ? [...dancers.values()].map((event) => <div key={event.username} className="text-center"><div className="animate-bounce text-4xl">🕺</div><div className="text-[10px]">{event.displayName}</div></div>) : <span className="self-center text-sm text-white/40">spmt parade to join.</span>}</div>;
    }
    if (game.id === 'memorylane') {
      const memories = passive.filter((event) => event.message.length >= 24).slice(-5);
      return <div className="grid gap-2">{memories.length ? memories.map((event) => <div key={event.id} className="rotate-[-1deg] rounded bg-white p-2 text-slate-900 shadow"><div className="text-[10px] font-bold">{event.displayName}</div><div className="line-clamp-2 text-xs">{event.message}</div></div>) : <span className="text-sm text-white/40">Share a story or memory in chat.</span>}</div>;
    }
    if (game.id === 'colorsymphony') {
      const notes = passive.flatMap((event) => Object.keys(COLORS).filter((color) => new RegExp(`\\b${color}\\b`, 'i').test(event.message)).map((color) => ({ color, id: `${event.id}-${color}` }))).slice(-16);
      return <div className="flex min-h-36 items-center justify-center gap-2">{notes.length ? notes.map((note, index) => <span key={`${note.id}-${index}`} className="grid h-12 w-8 place-items-center rounded-full text-xl" style={{ background: COLORS[note.color], transform: `translateY(${(index % 4) * -8}px)` }}>♪</span>) : <span className="text-sm text-white/40">Type color names to write the symphony.</span>}</div>;
    }
    if (game.id === 'rhythmpulse') {
      const bars = passive.slice(-20).map((event) => Math.min(100, 12 + event.message.length * 2 + emojiTokens(event.message).length * 12));
      return <div className="flex min-h-36 items-end justify-center gap-1">{bars.length ? bars.map((value, index) => <span key={`${passive[passive.length - bars.length + index]?.id}-${index}`} className="w-3 rounded-t bg-cyan-300/80" style={{ height: `${value}%`, minHeight: '8px' }} />) : <span className="self-center text-sm text-white/40">Chat creates the beat.</span>}</div>;
    }
    return <div className="grid min-h-36 place-items-center text-sm text-white/45">Live chat runtime connected.</div>;
  }, [channel, game.id, passive, recent]);

  return <section className="h-full min-h-0 overflow-hidden rounded-2xl border border-white/15 bg-slate-950/70 p-4 text-white shadow-2xl backdrop-blur"><header className="mb-3 flex items-center justify-between gap-2"><div><div className="text-[9px] uppercase tracking-[.18em] text-cyan-200/60">Games Hub</div><h2 className="font-bold">{game.name}</h2></div><span className="rounded-full bg-emerald-300/10 px-2 py-1 text-[9px] font-bold text-emerald-100">ACTIVE · #{channel}</span></header>{content}</section>;
}
