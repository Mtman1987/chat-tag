const LOUNGE = 'spacemountainlive';
const REQUIRED_SCOPE = 'moderator:manage:shoutouts';
const GLOBAL_COOLDOWN_MS = 2 * 60_000;
const TARGET_COOLDOWN_MS = 60 * 60_000;

// Twitch's native /shoutout action must use Helix, not an IRC chat message.
// The caller supplies the observed source channel, never the command author's login.
function createLoungeCheckinShoutout({ getToken, getClientId, lookupUser, fetchImpl = fetch, now = Date.now }) {
  let capability = { ready: false, reason: 'checking', checkedAt: null };
  let broadcasterId = '';
  let checkedToken = '';
  let lastSentAt = -Infinity;
  const sentTargets = new Map();
  let tail = Promise.resolve();

  async function inspectToken(token) {
    const response = await fetchImpl('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${token}` }, signal: AbortSignal.timeout(10_000),
    });
    const identity = response.ok ? await response.json() : null;
    let reason = 'ready';
    if (!identity) reason = 'authorization-required';
    else if (identity.login !== LOUNGE || !identity.user_id || identity.client_id !== getClientId()) reason = 'wrong-broadcaster-account';
    else if (!identity.scopes?.includes(REQUIRED_SCOPE)) reason = 'missing-shoutout-permission';
    broadcasterId = reason === 'ready' ? String(identity.user_id) : '';
    checkedToken = token;
    capability = { ready: reason === 'ready', reason, checkedAt: now() };
    return { ...capability };
  }

  async function refreshCapability() {
    try { return await inspectToken(await getToken()); }
    catch {
      capability = { ready: false, reason: 'authorization-unavailable', checkedAt: now() };
      return { ...capability };
    }
  }

  async function deliver(sourceChannel) {
    const target = String(sourceChannel || '').trim().replace(/^#/, '').toLowerCase();
    const result = (status, extra = {}) => ({ status, channel: target, destination: LOUNGE, ...extra });
    if (!/^[a-z0-9_]{1,25}$/.test(target)) return result('invalid-channel');
    if (target === LOUNGE) return result('self-shoutout');
    const timestamp = now();
    for (const [channel, sentAt] of sentTargets) if (timestamp - sentAt >= TARGET_COOLDOWN_MS) sentTargets.delete(channel);
    const nextAllowed = Math.max(lastSentAt + GLOBAL_COOLDOWN_MS, (sentTargets.get(target) ?? -Infinity) + TARGET_COOLDOWN_MS);
    if (nextAllowed > timestamp) return result('cooldown', { retryAfterSeconds: Math.ceil((nextAllowed - timestamp) / 1000) });
    try {
      const token = await getToken();
      if (token !== checkedToken || !capability.ready || now() - capability.checkedAt > 5 * 60_000) await inspectToken(token);
      if (!capability.ready) return result(capability.reason);
      const recipient = await lookupUser(target);
      if (!recipient?.id) return result('channel-not-found');
      const query = new URLSearchParams({
        from_broadcaster_id: broadcasterId,
        to_broadcaster_id: String(recipient.id),
        moderator_id: broadcasterId,
      });
      const response = await fetchImpl(`https://api.twitch.tv/helix/chat/shoutouts?${query}`, {
        method: 'POST',
        headers: { 'Client-ID': getClientId(), Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 204) {
        lastSentAt = now();
        sentTargets.set(target, lastSentAt);
        return result('sent');
      }
      if (response.status === 429) return result('cooldown');
      if (response.status === 401 || response.status === 403) {
        capability = { ready: false, reason: 'authorization-required', checkedAt: now() };
        return result('authorization-required');
      }
      if (response.status === 400) return result('not-eligible');
      return result('unavailable');
    } catch { return result('unavailable'); }
  }

  return {
    refreshCapability,
    getStatus: () => ({ ...capability, destination: LOUNGE }),
    // Serialize sends so simultaneous check-ins cannot race Twitch's cooldown.
    send(sourceChannel) {
      const pending = tail.then(() => deliver(sourceChannel));
      tail = pending.then(() => {}, () => {});
      return pending;
    },
  };
}

function formatCheckinShoutoutReply(result) {
  const target = `#${result.channel}`;
  if (result.status === 'sent') return `Native Twitch /shoutout sent for ${target} in the SpaceMountainLive Lounge.`;
  if (result.status === 'self-shoutout') return 'Twitch cannot give SpaceMountainLive a native shoutout from its own Lounge.';
  if (result.status === 'cooldown') return `The Lounge shoutout for ${target} is on Twitch cooldown${result.retryAfterSeconds ? ` (${result.retryAfterSeconds}s remaining)` : ''}. Your check-in still runs.`;
  if (['missing-shoutout-permission', 'authorization-required', 'wrong-broadcaster-account'].includes(result.status)) {
    return `The Lounge shoutout for ${target} could not send: SpaceMountainLive needs Twitch shoutout permission. Your check-in still runs.`;
  }
  if (result.status === 'not-eligible') return `Twitch could not send the Lounge shoutout for ${target}; the Lounge must be live with viewers and the target must be eligible. Your check-in still runs.`;
  return `The native Lounge shoutout for ${target} is unavailable right now. Your check-in still runs.`;
}

module.exports = { createLoungeCheckinShoutout, formatCheckinShoutoutReply };
