function normalizeChatHandle(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]/g, '');
}

function parseDiscordMention(value) {
  const match = String(value || '').trim().match(/^<@!?(\d+)>$/);
  return match?.[1] || '';
}

function getPlayerDisplayName(player, fallback = '') {
  return player?.twitchUsername || player?.username || player?.displayName || player?.discordUsername || fallback;
}

function getPlayerLookupKeys(player) {
  return [
    player?.twitchUsername,
    player?.username,
    player?.displayName,
    player?.login,
    player?.kickUsername,
    player?.discordUsername,
  ]
    .map(normalizeChatHandle)
    .filter(Boolean);
}

function resolvePlayerTarget(players, rawTarget) {
  const list = Array.isArray(players) ? players : [];
  const mentionId = parseDiscordMention(rawTarget);
  if (mentionId) {
    const player = list.find((candidate) => String(candidate?.discordId || '') === mentionId);
    return player
      ? { target: mentionId, player, matchType: 'discord-mention' }
      : { target: mentionId, error: 'not-found' };
  }

  const target = normalizeChatHandle(rawTarget);
  if (!target) return { target, error: 'empty' };

  const exact = list.find((player) => getPlayerLookupKeys(player).includes(target));
  if (exact) return { target, player: exact, matchType: 'exact' };

  if (target.length >= 4) {
    const prefixMatches = list.filter((player) =>
      getPlayerLookupKeys(player).some((key) => key.startsWith(target))
    );
    if (prefixMatches.length === 1) {
      return { target, player: prefixMatches[0], matchType: 'prefix' };
    }
    if (prefixMatches.length > 1) {
      return { target, error: 'ambiguous', matches: prefixMatches };
    }
  }

  return { target, error: 'not-found' };
}

function findTargetPlayer(players, rawTarget) {
  return resolvePlayerTarget(players, rawTarget).player;
}

function findPlayerForDiscordUser(players, discordUserId, userName) {
  const list = Array.isArray(players) ? players : [];
  const normalizedUserName = normalizeChatHandle(userName);
  return list.find((player) => {
    if (discordUserId && String(player?.discordId || '') === String(discordUserId)) return true;
    if (!normalizedUserName || normalizedUserName === 'unknown') return false;
    return getPlayerLookupKeys(player).includes(normalizedUserName);
  });
}

module.exports = {
  normalizeChatHandle,
  parseDiscordMention,
  getPlayerDisplayName,
  getPlayerLookupKeys,
  resolvePlayerTarget,
  findTargetPlayer,
  findPlayerForDiscordUser,
};
