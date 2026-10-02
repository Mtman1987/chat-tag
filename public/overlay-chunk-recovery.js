(() => {
  // Only the failed game viewer reloads; server-owned games and media continue.
  if (!location.pathname.startsWith('/overlay/game-hub/')) return;
  const key = 'nebula:chunk-recovery:' + location.pathname;
  let scheduled = false;
  function recover(error) {
    const text = error && (error.name || '') + ' ' + (error.message || error);
    if (scheduled || !/ChunkLoadError|Loading (?:CSS )?chunk .+ failed|Failed to fetch dynamically imported module/i.test(text || '')) return;
    let last;
    try { last = Number(sessionStorage.getItem(key)) || 0; }
    catch { return; } // Never create a reload loop when storage is unavailable.
    scheduled = true;
    const wait = Math.max(1000, last + 60000 - Date.now());
    setTimeout(() => {
      try { sessionStorage.setItem(key, String(Date.now())); }
      catch { return; }
      location.reload();
    }, wait);
  }
  addEventListener('error', event => recover(event.error || event.message));
  addEventListener('unhandledrejection', event => recover(event.reason));
  // React catches lazy-import errors and logs them before showing its fatal UI.
  const original = console.error;
  console.error = function () {
    original.apply(console, arguments);
    for (const value of arguments) recover(value);
  };
})();
