function normalizeChatHandle(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]/g, '');
}

function compactChatHandle(value) {
  return normalizeChatHandle(value).replace(/_/g, '');
}

function parseDiscordMention(value) {
  const match = String(value || '').trim().match(/^<@!?(\d+)>$/);
  return match?.[1] || '';
}

function getMentionEntries(mentions) {
  if (!mentions) return [];
  if (Array.isArray(mentions)) return mentions;
  if (typeof mentions !== 'object') return [];

  const directEntries = Object.entries(mentions)
    .filter(([key]) => key !== 'users' && key !== 'members')
    .map(([id, entry]) => ({ id, ...entry }));
  const userEntries = Array.isArray(mentions.users)
    ? mentions.users
    : Object.entries(mentions.users || {}).map(([id, entry]) => ({ id, ...entry }));
  const memberEntries = Array.isArray(mentions.members)
    ? mentions.members
    : Object.entries(mentions.members || {}).map(([id, entry]) => ({ id, ...entry }));

  return [...directEntries, ...userEntries, ...memberEntries];
}

function getMentionLookupNames(mentions, mentionId) {
  if (!mentionId) return [];
  const matches = getMentionEntries(mentions).filter((entry) =>
    String(entry?.id || entry?.userId || entry?.user?.id || '') === String(mentionId)
  );
  return matches.flatMap((mention) => [
    mention.username,
    mention.global_name,
    mention.globalName,
    mention.displayName,
    mention.display_name,
    mention.nick,
    mention.name,
    mention.user?.username,
    mention.user?.global_name,
    mention.user?.globalName,
  ]).filter(Boolean);
}

function replaceDiscordUserMentions(text, mentions) {
  return String(text || '').replace(/<@!?(\d+)>/g, (mention, mentionId) => {
    const displayName = getMentionLookupNames(mentions, mentionId)[0];
    return displayName ? `@${displayName}` : mention;
  });
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

function findUniqueCompactMatch(list, target) {
  const compactTarget = compactChatHandle(target);
  if (!compactTarget) return null;
  const matches = list.filter((player) =>
    getPlayerLookupKeys(player).some((key) => key.replace(/_/g, '') === compactTarget)
  );
  return matches.length === 1 ? matches[0] : null;
}

function resolvePlayerTarget(players, rawTarget, mentions) {
  const list = Array.isArray(players) ? players : [];
  const mentionId = parseDiscordMention(rawTarget);
  if (mentionId) {
    const player = list.find((candidate) => String(candidate?.discordId || '') === mentionId);
    if (player) return { target: mentionId, player, matchType: 'discord-mention' };

    for (const name of getMentionLookupNames(mentions, mentionId)) {
      const resolved = resolvePlayerTarget(list, name);
      if (resolved.player) {
        return { target: mentionId, player: resolved.player, matchType: `discord-mention-${resolved.matchType}` };
      }
    }

    return { target: mentionId, error: 'not-found' };
  }

  const target = normalizeChatHandle(rawTarget);
  if (!target) return { target, error: 'empty' };

  const exact = list.find((player) => getPlayerLookupKeys(player).includes(target));
  if (exact) return { target, player: exact, matchType: 'exact' };

  const compact = findUniqueCompactMatch(list, target);
  if (compact) return { target, player: compact, matchType: 'compact' };

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

function findTargetPlayer(players, rawTarget, mentions) {
  return resolvePlayerTarget(players, rawTarget, mentions).player;
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
  compactChatHandle,
  parseDiscordMention,
  replaceDiscordUserMentions,
  getPlayerDisplayName,
  getPlayerLookupKeys,
  resolvePlayerTarget,
  findTargetPlayer,
  findPlayerForDiscordUser,
};
