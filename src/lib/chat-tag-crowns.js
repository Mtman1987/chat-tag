const { normalizeChatHandle } = require('./chat-tag-player-lookup');

const CROWN = '👑';
const CROWN_UNITS = '\\uD83D\\uDC51';
const MIN_CROWNABLE_LENGTH = 3;
// Matches text like "👑", "👑#1 " right before a name so crowns are never doubled.
const ALREADY_CROWNED = new RegExp(`${CROWN}\\s*#?\\d*\\s*@?$`);

function normalizeWinners(winners) {
  if (!Array.isArray(winners)) return [];
  return winners
    .map((entry) => ({
      userId: entry?.userId ? String(entry.userId) : '',
      username: String(entry?.username || '').replace(/^@+/, '').trim(),
      place: Number(entry?.place) || 0,
      month: entry?.month || '',
    }))
    .filter((entry) => entry.username);
}

function getWinners(source) {
  if (Array.isArray(source)) return normalizeWinners(source);
  return normalizeWinners(
    source?.monthlyWinners || source?.tagGame?.state?.monthlyWinners || []
  );
}

function findWinner(name, winners) {
  const handle = normalizeChatHandle(name);
  if (!handle) return null;
  return (
    getWinners(winners).find((entry) => normalizeChatHandle(entry.username) === handle) || null
  );
}

function isWinner(name, winners) {
  return Boolean(findWinner(name, winners));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// "van braak" also matches "van_braak" and "vanbraak" the way player lookup does.
function namePattern(username) {
  return username
    .split(/[\s_]+/)
    .filter(Boolean)
    .map(escapeRegExp)
    .join('[\\s_]*');
}

// Adds the crown to every mention of a monthly winner inside a message.
// The crown goes before an "@" so chat mentions keep working: 👑@winner.
function decorateCrowns(text, winners) {
  const list = getWinners(winners);
  if (!text || !list.length) return text;

  let output = String(text);
  for (const winner of list) {
    if (winner.username.length < MIN_CROWNABLE_LENGTH) continue;
    const pattern = new RegExp(
      `(^|[^\\w@./${CROWN_UNITS}])(@?)(${namePattern(winner.username)})(?![\\w])`,
      'gi'
    );
    output = output.replace(pattern, (match, prefix, at, name, offset, full) => {
      const before = full.slice(0, offset + prefix.length);
      if (ALREADY_CROWNED.test(before)) return match;
      return `${prefix}${CROWN}${at}${name}`;
    });
  }
  return output;
}

function crownName(name, winners) {
  if (!name) return name;
  const raw = String(name);
  if (raw.includes(CROWN)) return raw;
  const winner = findWinner(raw, winners);
  return winner ? `${CROWN}${raw}` : raw;
}

function crownNameWithPlace(name, winners) {
  const winner = findWinner(name, winners);
  return winner ? `${name} ${CROWN}#${winner.place}` : name;
}

// Keys holding urls/ids must stay untouched so links and interactions keep working.
const SKIPPED_KEYS = /(^|_)(url|href|link|src|id|ids|token|secret)$/i;

function decorateCrownsDeep(value, winners) {
  const list = getWinners(winners);
  if (!list.length) return value;
  if (typeof value === 'string') return decorateCrowns(value, list);
  if (Array.isArray(value)) return value.map((item) => decorateCrownsDeep(item, list));
  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, item] of Object.entries(value)) {
      next[key] = SKIPPED_KEYS.test(key) ? item : decorateCrownsDeep(item, list);
    }
    return next;
  }
  return value;
}

module.exports = {
  CROWN,
  normalizeWinners,
  getWinners,
  findWinner,
  isWinner,
  crownName,
  crownNameWithPlace,
  decorateCrowns,
  decorateCrownsDeep,
};
