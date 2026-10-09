// Only read requests are safe to replay without an application idempotency key.
async function fetchBotApi(url, options = {}, fetchImpl = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const readOnly = String(options.method || 'GET').toUpperCase() === 'GET';
  for (let attempt = 0; ; attempt++) {
    if (options.signal?.aborted) throw options.signal.reason || new Error('Request aborted');
    try {
      const response = await fetchImpl(url, options);
      if (!readOnly || attempt > 0 || ![502, 503, 504].includes(response.status)) return response;
      // Drain the failed response before reusing the connection.
      await response.body?.cancel().catch(() => {});
    } catch (error) {
      if (!readOnly || attempt > 0 || options.signal?.aborted || error?.name !== 'TypeError') throw error;
    }
    await pause(250);
  }
}
module.exports = { fetchBotApi };
