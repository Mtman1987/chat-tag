// One poll at a time; keep delivered IDs until the durable API acknowledges them.
// Failed sends remain pending and can be retried by this bot or after a restart.
function createWordChainLifecycleRunner({ apiCall, send, warn = console.warn }) {
  let running = false;
  const delivered = new Set();
  const request = async (body) => {
    const result = await apiCall('/api/game-hub/lifecycle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!result || result.__ok === false || result.error) throw new Error(result?.error || 'Lifecycle request failed');
    return result;
  };
  return async function tick() {
    if (running) return;
    running = true;
    try {
      const acknowledgedResults = [...delivered];
      const result = await request({ acknowledgedResults });
      acknowledgedResults.forEach(id => delivered.delete(id));
      const attemptedChannels = new Set();
      for (const event of result.wordChainResults || []) {
        if (delivered.has(event.id) || attemptedChannels.has(event.channel)) continue;
        // One result per tenant per 30-second poll. Long scoreboards and any
        // older queued messages must not arrive as a back-to-back burst.
        attemptedChannels.add(event.channel);
        try {
          await send(event.channel, event.message);
          delivered.add(event.id);
        } catch (error) {
          warn(`[WordChain] Result delivery failed for #${event.channel}: ${error?.message || error}`);
          // Retry this tenant's first pending message on the next poll without
          // blocking results for other tenants.
        }
      }
      if (delivered.size) {
        const ids = [...delivered];
        await request({ acknowledgedResults: ids, ackOnly: true });
        ids.forEach(id => delivered.delete(id));
      }
    } finally {
      running = false;
    }
  };
}

module.exports = { createWordChainLifecycleRunner };
