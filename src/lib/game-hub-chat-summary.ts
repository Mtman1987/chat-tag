import { getGameHubGame } from '@/lib/game-hub-registry';
import { getGameHubStore, normalizeGameHubChannel, normalizeGameHubPlayerId } from '@/lib/game-hub-state';
import { getScoringSettings, scoreFromTagCounts } from '@/lib/scoring';

export const TWITCH_REPLY_LIMIT = 480;

export type GameHubPlayerSnapshot = {
  gameId: string;
  name: string;
  shortName: string;
  rank: number | null;
  score: number;
  wins: number;
  plays: number;
  joined: boolean;
  active: boolean;
  summary: string;
};

export type GamesPointsStanding = {
  rank: number;
  id: string;
  username: string;
  displayName: string;
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
};

function normalized(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/^@+/, '');
}

function number(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function ordinal(rank: number | null): string {
  if (!rank || rank < 1) return '—';
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`;
  const suffix = rank % 10 === 1 ? 'st' : rank % 10 === 2 ? 'nd' : rank % 10 === 3 ? 'rd' : 'th';
  return `${rank}${suffix}`;
}

function resolveHubPlayer(state: any, userId: unknown, username: unknown) {
  const store = getGameHubStore(state);
  const playerId = normalizeGameHubPlayerId(userId, username);
  const direct = store.players[playerId];
  if (direct) return direct;
  const wanted = normalizeGameHubChannel(username);
  return Object.values(store.players).find((player) => normalizeGameHubChannel(player.username) === wanted) || null;
}

function membershipRank(state: any, gameId: string, playerId: string): number | null {
  const players = Object.values(getGameHubStore(state).players)
    .filter((player) => Boolean(player.joinedGames?.[gameId]))
    .sort((left, right) => {
      const a = left.joinedGames[gameId];
      const b = right.joinedGames[gameId];
      return number(b?.score) - number(a?.score)
        || number(b?.wins) - number(a?.wins)
        || String(a?.joinedAt || '').localeCompare(String(b?.joinedAt || ''));
    });
  const index = players.findIndex((player) => player.id === playerId);
  return index >= 0 ? index + 1 : null;
}

function tagReferenceMatches(reference: unknown, key: string, player: any): boolean {
  const wanted = normalized(reference);
  if (!wanted) return false;
  return [key, player?.id, player?.twitchUsername, player?.username, player?.displayName]
    .map(normalized)
    .some((candidate) => candidate && candidate === wanted);
}

function findTagPlayer(state: any, hubPlayer: any, username: unknown) {
  const wantedName = normalizeGameHubChannel(hubPlayer?.username || username);
  const rawId = String(hubPlayer?.id || '').replace(/^twitch:/, '');
  return Object.entries(state.tagPlayers || {}).find(([key, player]: [string, any]) => {
    const ids = [key, player?.id].map((value) => String(value || '').replace(/^user_/, ''));
    if (rawId && ids.includes(rawId)) return true;
    return [player?.twitchUsername, player?.username, player?.displayName]
      .map(normalizeGameHubChannel)
      .includes(wantedName);
  }) || null;
}

function chatTagSnapshot(state: any, hubPlayer: any, username: unknown) {
  const found = findTagPlayer(state, hubPlayer, username);
  if (!found) return null;
  const [key, player] = found as [string, any];
  let tags = 0;
  let tagged = 0;
  for (const event of state.tagHistory || []) {
    if (event?.blocked) continue;
    if (tagReferenceMatches(event?.taggerId || event?.from, key, player)) tags += 1;
    if (tagReferenceMatches(event?.taggedId || event?.to, key, player)) tagged += 1;
  }
  const score = scoreFromTagCounts({ tags, tagged }, getScoringSettings(state));
  const passes = number(player?.passCount || (player?.hasPass ? 1 : 0));
  const ranked = Object.entries(state.tagPlayers || {})
    .filter(([, candidate]: [string, any]) => !candidate?.optedOut)
    .map(([candidateKey, candidate]: [string, any]) => {
      let candidateTags = 0;
      let candidateTagged = 0;
      for (const event of state.tagHistory || []) {
        if (event?.blocked) continue;
        if (tagReferenceMatches(event?.taggerId || event?.from, candidateKey, candidate)) candidateTags += 1;
        if (tagReferenceMatches(event?.taggedId || event?.to, candidateKey, candidate)) candidateTagged += 1;
      }
      return {
        key: candidateKey,
        score: scoreFromTagCounts({ tags: candidateTags, tagged: candidateTagged }, getScoringSettings(state)),
      };
    })
    .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key));
  const rankIndex = ranked.findIndex((entry) => entry.key === key);
  return {
    rank: rankIndex >= 0 ? rankIndex + 1 : null,
    score,
    active: player?.isActive !== false,
    summary: `${score.toLocaleString()} pts · ${tags} tags · ${tagged} tagged · ${passes} pass${passes === 1 ? '' : 'es'}`,
  };
}

function bingoSummary(state: any, hubPlayer: any, membership: any) {
  const board = state.bingoCards?.personalBoards?.[hubPlayer?.id] || null;
  const claimed = Object.keys(board?.covered || {}).length;
  const remaining = Math.max(0, 25 - claimed);
  const wins = number(membership?.wins);
  return `${wins} bingo${wins === 1 ? '' : 's'} · ${claimed}/25 · ${remaining} left`;
}

export function getPlayerGameSnapshots(
  state: any,
  gameIds: string[],
  input: { userId?: unknown; username?: unknown },
): GameHubPlayerSnapshot[] {
  const hubPlayer = resolveHubPlayer(state, input.userId, input.username);
  return gameIds.map((gameId) => {
    const game = getGameHubGame(gameId);
    if (!game) return null;
    const membership = hubPlayer?.joinedGames?.[gameId];
    let joined = Boolean(membership);
    let active = Boolean(membership?.active);
    let rank = hubPlayer && membership ? membershipRank(state, gameId, hubPlayer.id) : null;
    let score = number(membership?.score);
    let summary = joined
      ? `${score.toLocaleString()} score · ${number(membership?.wins)} wins · ${number(membership?.plays)} plays`
      : 'not joined';

    if (gameId === 'chat-tag') {
      const tag = chatTagSnapshot(state, hubPlayer, input.username);
      if (tag) {
        joined = true;
        active = membership ? Boolean(membership.active) : tag.active;
        rank = tag.rank;
        score = tag.score;
        summary = tag.summary;
      }
    } else if (gameId === 'bingo' && hubPlayer && membership) {
      summary = bingoSummary(state, hubPlayer, membership);
    }

    return {
      gameId,
      name: game.name,
      shortName: game.shortName,
      rank,
      score,
      wins: number(membership?.wins),
      plays: number(membership?.plays),
      joined,
      active,
      summary,
    };
  }).filter(Boolean) as GameHubPlayerSnapshot[];
}

export function compactGameSnapshot(snapshot: GameHubPlayerSnapshot): string {
  const rank = snapshot.rank ? ` [${ordinal(snapshot.rank)}]` : '';
  return `[${snapshot.shortName}]${rank} ${snapshot.summary}`;
}

export function gamesPointsStandings(state: any): GamesPointsStanding[] {
  return Object.values(getGameHubStore(state).players)
    .sort((left, right) => number(right.gamePointsBalance) - number(left.gamePointsBalance)
      || number(right.lifetimeEarned) - number(left.lifetimeEarned)
      || String(left.displayName || left.username).localeCompare(String(right.displayName || right.username)))
    .map((player, index) => ({
      rank: index + 1,
      id: player.id,
      username: player.username,
      displayName: player.displayName,
      balance: number(player.gamePointsBalance),
      lifetimeEarned: number(player.lifetimeEarned),
      lifetimeSpent: number(player.lifetimeSpent),
    }));
}

export function getGamesPointsStanding(state: any, userId: unknown, username: unknown): GamesPointsStanding | null {
  const player = resolveHubPlayer(state, userId, username);
  if (!player) return null;
  return gamesPointsStandings(state).find((entry) => entry.id === player.id) || null;
}

export function allPlayedGameIds(state: any, userId: unknown, username: unknown): string[] {
  const player = resolveHubPlayer(state, userId, username);
  const ids = new Set(
    player ? Object.keys(player.joinedGames || {}).filter((gameId) => Boolean(getGameHubGame(gameId))) : [],
  );
  if (findTagPlayer(state, player, username)) ids.add('chat-tag');
  return [...ids];
}

export function fitCompactReplyWithLink(prefix: string, segments: string[], link: string, limit = TWITCH_REPLY_LIMIT): string {
  const suffix = link ? ` · ${link}` : '';
  const safePrefix = String(prefix || '').trim();
  const available = Math.max(0, limit - suffix.length);
  let text = safePrefix.slice(0, available);
  let used = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const separator = used === 0 ? ' ' : ' | ';
    const candidate = `${text}${separator}${segments[index]}`;
    if (candidate.length > available) break;
    text = candidate;
    used += 1;
  }

  const remaining = segments.length - used;
  if (remaining > 0) {
    const more = `${used ? ' | ' : ' '}+${remaining} more`;
    if (`${text}${more}`.length <= available) text += more;
  }

  return `${text}${suffix}`.slice(0, limit);
}
