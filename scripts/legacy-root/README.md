# Legacy root utility scripts

These one-off maintenance/test scripts were moved out of the repository root as part of the road-to-production cleanup.

Most of these scripts predate the current Fly.io + volume-store deployment and may still reference Firebase, hard-coded local paths, or old environment assumptions. Review and update a script before running it against production.

Runtime entry points intentionally left in the repo root:

- `bot.js` — Fly bot process entry point.
- `migrate-data.js` — still referenced by `npm run migrate` until the old Firebase migration path is removed.
- `ws-server.js` — still referenced by `npm run ws` until the legacy websocket path is removed.
