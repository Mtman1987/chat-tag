type PlayerRecord = Record<string, any>;

function toTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value && typeof value === 'object') {
    const candidate = value as { seconds?: unknown; _seconds?: unknown; toDate?: () => Date };
    if (typeof candidate.toDate === 'function') return candidate.toDate().getTime();
    const seconds = Number(candidate.seconds ?? candidate._seconds);
    if (Number.isFinite(seconds)) return seconds * 1000;
  }
  return null;
}

function dayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function normalize(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/^[@#]+/, '');
}

function aliases(player: PlayerRecord): Set<string> {
  return new Set(
    [player.id, player.twitchUsername, player.username, player.displayName]
      .map(normalize)
      .filter(Boolean),
  );
}

function entryReferencesPlayer(entry: PlayerRecord, names: Set<string>): boolean {
  return [entry.taggerId, entry.taggedId, entry.from, entry.to]
    .map(normalize)
    .some((value) => names.has(value));
}

export function markPlayerPlayed(player: PlayerRecord, value: unknown = Date.now()): boolean {
  const timestamp = toTimestamp(value);
  if (timestamp === null) return false;

  const before = JSON.stringify([
    player.joinedAt,
    player.firstPlayedAt,
    player.lastPlayedAt,
    player.playedDays,
    player.daysPlayed,
  ]);
  const days = new Set(
    (Array.isArray(player.playedDays) ? player.playedDays : [])
      .map((day: unknown) => String(day || '').slice(0, 10))
      .filter((day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day)),
  );
  days.add(dayKey(timestamp));

  const joinedAt = toTimestamp(player.joinedAt);
  const firstPlayedAt = toTimestamp(player.firstPlayedAt);
  const lastPlayedAt = toTimestamp(player.lastPlayedAt);
  player.joinedAt = new Date(joinedAt === null ? timestamp : Math.min(joinedAt, timestamp)).toISOString();
  player.firstPlayedAt = new Date(firstPlayedAt === null ? timestamp : Math.min(firstPlayedAt, timestamp)).toISOString();
  player.lastPlayedAt = new Date(lastPlayedAt === null ? timestamp : Math.max(lastPlayedAt, timestamp)).toISOString();
  player.playedDays = Array.from(days).sort();
  player.daysPlayed = Math.max(Number(player.daysPlayed || 0), player.playedDays.length);

  return before !== JSON.stringify([
    player.joinedAt,
    player.firstPlayedAt,
    player.lastPlayedAt,
    player.playedDays,
    player.daysPlayed,
  ]);
}

export function inferPlayerHistory(state: PlayerRecord, player: PlayerRecord): boolean {
  const names = aliases(player);
  const timestamps: number[] = [];

  for (const entry of state.adminHistory || []) {
    if (String(entry?.action || '').toLowerCase() !== 'join') continue;
    const details = normalize(entry?.details);
    const performedBy = normalize(entry?.performedBy);
    if (![...names].some((name) => performedBy === name || details.startsWith(`${name} joined the game`))) continue;
    const timestamp = toTimestamp(entry?.timestamp);
    if (timestamp !== null) timestamps.push(timestamp);
  }

  for (const entry of state.tagHistory || []) {
    if (!entryReferencesPlayer(entry || {}, names)) continue;
    const timestamp = toTimestamp(entry?.timestamp);
    if (timestamp !== null) timestamps.push(timestamp);
  }

  const lastChatAt = toTimestamp(player.lastChatAt);
  if (lastChatAt !== null) timestamps.push(lastChatAt);
  const existingJoinedAt = toTimestamp(player.joinedAt);
  if (existingJoinedAt !== null) timestamps.push(existingJoinedAt);
  if (timestamps.length === 0) return false;

  let changed = false;
  for (const timestamp of timestamps) changed = markPlayerPlayed(player, timestamp) || changed;
  return changed;
}
