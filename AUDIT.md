# Chat-Tag Codebase Audit & Road to Production

**Date:** 2026-05-31
**Scope:** All source files in `chat-tag/`
**Current local branch:** `work`
**Remote status:** No Git remotes are configured in this checkout, so the latest production-oriented changes are local-only until a remote is added and pushed.

---

## 2026-05-31 Local Production Recovery Snapshot

These are the production-oriented changes that were already present locally before this audit update:

- `7bd1fad` — **Complete Discord SPMT command handling**
  - Expanded the Kite/DSH `/api/discord/chat` handler to cover the Discord-side command surface: `join`, `leave`, `optout`, `tag`, `pass`, `status`, `live`, `pack`, `score`, `rank`, `players`, `away`, `rules`, `pinrank`, `givepass`, moderation handoffs, platform links, and help.
  - Added a Discord pack-preview image route for Quackverse pack replies.
  - Removed stale `@spmt` wording from selected UI copy and made the bot-channel input use `onKeyDown`.
- `5d9c065` — **Quiet production Discord chat logging**
  - Reduced noisy request/body/channel logging in production while keeping targeted diagnostics available.
- `363b264` — **Use global debug flag for request logs**
  - Gated remaining Discord chat request logs behind the global `DEBUG` scope flag.

**Branch note:** A local branch named `production` was not present in this checkout when this file was updated. The recoverable work is on `work` and should be pushed or merged according to the deployment workflow once the remote is restored.

---

## Road to Production — Next Work Queue

### P0 — Before any production deploy
- [ ] **Restore/push Git remote state.** Add the GitHub remote, fetch branches, confirm where `work` should land, then push or PR these local commits. Do not deploy from an untracked local-only branch.
- [ ] **Run the full production build.** `npm run typecheck` and `npm run build` must both pass on the machine that will deploy.
- [ ] **Deploy-time data repair.** Run `POST /api/admin/fix-players` once after deploy to backfill missing avatars and merge duplicate/manual players.
- [ ] **Secrets audit.** Confirm production values for `BOT_SECRET_KEY`, Discord webhook/bot token variables, Twitch Helix credentials, `PUBLIC_APP_ORIGIN` or equivalent public URL, and `INTERNAL_APP_ORIGIN`.
- [ ] **Manual smoke test in Discord.** In the real Discord channel, verify `spmt help`, `spmt join`, `spmt status`, `spmt tag <user>`, `spmt pass`, `spmt live`, `spmt players`, `spmt score`, `spmt rank`, `spmt pack`, and `spmt away`.
- [ ] **Manual smoke test in Twitch.** Verify the same critical commands in Twitch chat and confirm Discord-active users appear in `spmt live` without breaking Twitch live grouping.

### P1 — Stabilize Discord command parity
- [ ] **Extract shared command logic.** Discord and Twitch now have broad command parity, but the logic still lives in separate large handlers. Shared help/rules/mod command text and shared player lookup are extracted; scoring, tag/pass, and live/player summaries still need shared helpers.
- [x] **Normalize command responses.** Discord command replies now flow through shared embed helpers with `allowed_mentions: { parse: [] }`, shared command text, and consistent cleanup handling.
- [ ] **Add Discord route tests.** Shared player-lookup fixtures now cover Discord mentions and username matching; full Kite/DSH route payload fixtures, missing channel/message IDs, and admin/mod command handoff tests still need coverage.
- [x] **Capture failed webhook sends.** Discord webhook/bot send failures now append structured `discord-send-failed` entries to volume-store admin history without enabling full request-body logging.

### P2 — Lock down admin and data mutation surfaces
- [ ] **Finish server-side role authorization.** Every dangerous mutation route should use one shared auth/authorization helper instead of scattered checks.
- [ ] **Move dangerous controls to `/admin`.** Keep player-facing surfaces focused on playing/viewing; isolate reset, force winner, channel pruning, logs, fix players, and scoring controls.
- [ ] **Review bot secret usage.** Keep bot-to-app routes protected, but avoid blocking legitimate Kite/DSH Discord ingress paths that cannot send the same secret.
- [x] **Add audit entries for admin actions.** Admin maintenance/settings routes now append admin-history entries with actor, action, target/details, and timestamp.

### P3 — Operational hardening
- [x] **Prune or archive root utility scripts.** Archived one-off root utilities in `scripts/legacy-root/` with README notes; runtime/package entry points remain at root until removed separately.
- [x] **Bound in-memory pagination/state.** Replaced `global.*` pagination caches in `bot.js` with bounded Maps and expiry.
- [x] **Document deployment runbook.** `DEPLOYMENT.md` now covers Fly apps, build gates, secrets, deploy commands, repair calls, Discord/Twitch smoke tests, health checks, and rollback.
- [x] **Add observability around auto-rotate/away.** Bot auto-rotate, FFA fallback, null-state assignment, and FFA reminder events now write low-noise entries to the mod log; away toggles already write mod-log entries.

---

## 🔴 CRITICAL — Fix First

### 0. Web app has no real role separation yet; dangerous admin actions must be server-locked
- **Where:** `src/app/main-dashboard.tsx`, `src/components/chat-tag-game.tsx`, `src/app/settings/page.tsx`, `src/app/api/tag/route.ts`, `src/app/api/admin/*`, `src/app/api/settings/route.ts`, `src/app/api/logs/route.ts`, `src/app/api/update-discord/route.ts`
- **Issue:** The app currently treats "signed in" and "authorized to administrate the game" as the same thing in too many places. UI controls like `Make Me It`, `Trigger Timeout`, score reset, forced winner assignment, bot channel controls, and log download were historically exposed in the main app shell. Several API routes also mutated state without checking any authenticated role. Deleting `/overlay/...` from the URL was enough to reach the base app and operate admin surfaces.
- **Immediate fix:** Hide admin UI for non-admins and require a verified session token on all admin-only routes and tag admin actions.
- **Future-year fix:** Move dangerous controls to a separate `/admin` surface, add persistent app roles (`owner`, `admin`, `mod`, `player`) in state, and stop using username checks as the sole authority model.

### 0b. Session model is split between localStorage and server routes
- **Where:** `src/contexts/session-context.tsx`, `src/app/auth/callback/page.tsx`, `src/app/api/auth/twitch/callback/route.ts`, all authenticated API routes
- **Issue:** The browser session lived in `localStorage`, but server routes could only trust cookies or explicit auth headers. That made server-side authorization brittle and easy to accidentally skip.
- **Immediate fix:** Mirror the signed session token into a cookie at login time, and send the bearer token on client-side admin fetches.
- **Future-year fix:** Replace the ad hoc session flow with a single server-trusted auth layer and central authorization helpers used by every mutation route.

### 1. Discord tag works but sends NO confirmation back to the user
- **Where:** `bot.js` → tag command handler + `src/app/api/discord/announce/route.ts`
- **Issue:** When a tag happens via Discord (through DSH), the `/api/discord/announce` route only pushes game state to DSH via `/api/chat-tag/refresh` — it never sends a confirmation message back to the Discord channel or user. The bot's tag handler in `bot.js` sends confirmation to Twitch chat via `reply()` and `broadcastToPlayers()`, but there's no equivalent Discord message path. The announce route returns `{ success: true }` silently.
- **Fix:** After a successful tag via Discord, post a confirmation embed to the Discord webhook (or the channel the command came from) with who tagged whom, points earned, and who's now "it".

### 2. Only the tag command works from Discord — all other 24 commands are broken
- **Where:** `bot.js` message handler + DSH integration
- **Issue:** The bot's command parser in `bot.js` only handles Twitch IRC messages (`client.on('message', ...)`). Discord commands presumably come through DSH calling chat-tag API routes directly, but there's no Discord command router. Commands like `join`, `sleep`, `wake`, `status`, `score`, `rank`, `players`, `live`, `card`, `claim`, `pass`, `help`, etc. have no Discord-side handler.
- **Fix:** Either:
  - (A) Create a `/api/discord/command` route that accepts command name + args + user info from DSH and routes to the same logic as the bot's Twitch command handler, OR
  - (B) Extract the bot command logic into shared functions that both the Twitch bot and a Discord command endpoint can call.

### 3. Three separate user lists are out of sync (200+ bot channels vs 109 community vs 113 players)
- **Where:** `state.botChannels` (~200+), `state.tagPlayers` (~113), community list reads from `/api/bot/channels` + `/api/twitch/live`
- **Root cause:** Three independent data stores:
  - `state.botChannels` — every channel the bot has ever been told to join (grows forever, never pruned)
  - `state.tagPlayers` — only people who explicitly joined the tag game
  - `state.users` — populated by Discord sync (`/api/bot/sync-discord`) and Twitch auth, separate from both
  - Community list component reads `botChannels` via `/api/bot/channels`, then cross-references with Twitch live API
  - Leaderboard reads `tagPlayers` via `/api/tag`
  - These never reconcile
- **Fix:** Establish `state.tagPlayers` as the single source of truth for "who is in the game." Bot channels should be derived from tagPlayers (auto-add channel when player joins, auto-remove when they leave). Community list should read from tagPlayers, not botChannels. Add a cleanup to prune botChannels entries that have no matching tagPlayer.

### 4. Players who left the game can still get tagged
- **Where:** `src/app/api/tag/route.ts` → `action: 'tag'` handler
- **Issue:** The `leave` action deletes the player from `state.tagPlayers`, but if they were "it", `state.tagGame.state.currentIt` still points to their deleted ID. The tag handler checks `state.tagPlayers[targetUserId]` but doesn't verify the tagger still exists after deletion. Also, the `remove` channel route (`/api/bot/channels/remove`) deletes both the channel AND the player — but the `leave` action only deletes the player, leaving their bot channel entry orphaned.
- **Fix:** On `leave`: also clear `currentIt` if the leaving player was it, remove their bot channel entry, and trigger an auto-rotate. On `tag`: verify both tagger and target still exist in `tagPlayers` before processing.

### 5. Adding players manually (UI or `@spmt join @user`) creates them with no avatar
- **Where:** `bot.js` join command, `src/app/api/tag/route.ts` → `action: 'join'`, `src/components/chat-tag-game.tsx` → `handleAddPlayer`
- **Issue:** Three paths create players without avatars:
  1. **Bot `join @user` command:** Calls `helixGetUser` to get avatar, passes it to API — this works IF Helix returns data. But the API `join` handler stores `avatar || ''`, so if the lookup fails silently, avatar is empty.
  2. **UI "Add Player" input:** `handleAddPlayer` in `chat-tag-game.tsx` sends `avatar: ''` — never looks up the Twitch profile at all.
  3. **API `join` action:** Accepts whatever avatar is passed, defaults to empty string.
- **Fix:** When a player is added (any path), if no avatar is provided, the API `join` handler should look up the Twitch user via Helix API and fetch their `profile_image_url` before storing. The `fix-players` admin route already has this logic — extract it into a shared helper.

### 6. All Firebase/Firestore references need to be scrubbed
- **Files affected:**
  - `src/firebase/` — entire directory (config.ts, index.ts, provider.tsx, client-provider.tsx, errors.ts, error-emitter.ts, non-blocking-login.tsx, non-blocking-updates.tsx, auth/use-user.tsx, firestore/use-collection.tsx, firestore/use-doc.tsx)
  - `src/lib/firebase-admin.ts` — dead import, credentials don't exist
  - `src/lib/types.ts` — imports `Timestamp` from `firebase/firestore` and `firebase-admin/firestore`
  - `src/firebase/config.ts` — hardcoded Firebase project keys
  - `firestore.rules` — no longer applies
  - `firestore.indexes.json` — no longer applies
  - `firebase.json` — hosting config for a deployment method we don't use
  - `.firebaserc` — Firebase project binding
  - `package.json` — `firebase` and `firebase-admin` dependencies
  - `src/app/layout.tsx` — does NOT import Firebase providers (good), but the files still exist
  - `src/components/FirebaseErrorListener.tsx` — referenced by provider.tsx
- **Fix:** Delete all of the above. Update `types.ts` to remove Timestamp imports (the volume-store uses plain numbers for timestamps). Remove `firebase` and `firebase-admin` from package.json.

---

## 🟠 HIGH — Broken Features

### 7. Settings page "Logs" button shows no logs
- **Where:** `src/app/api/logs/route.ts` + bot.js `/write-logs` endpoint
- **Issue:** The logs route calls `BOT_URL/write-logs` to trigger the bot to dump its in-memory log buffer to a file, then reads that file. But:
  1. The bot writes logs to `API_BASE/api/bot/write-logs` which writes to the volume at `data/bot-logs.txt`
  2. The logs GET route reads from the same path — but the bot and the web app are on DIFFERENT Fly.io machines. The bot writes to its own filesystem (no volume mount in `Dockerfile.bot`/`fly-bot.toml`), and the web app reads from its volume. They never share the same file.
- **Fix:** Either mount a shared volume on the bot machine, or change the logs route to fetch logs directly from the bot's HTTP endpoint (`BOT_URL/write-logs` response) instead of reading a local file.

### 8. Discord announce route doesn't send a webhook message — only refreshes DSH embed
- **Where:** `src/app/api/discord/announce/route.ts`
- **Issue:** The route builds game state and POSTs it to `DSH_URL/api/chat-tag/refresh` to update the embed, but never posts an actual announcement message to the Discord webhook. So tag events update the leaderboard embed silently but there's no "🎯 X tagged Y!" message in Discord.
- **Fix:** After refreshing DSH, also POST a formatted embed to `DISCORD_WEBHOOK_URL` with the tag details.

### 9. `update-discord` route reads leaderboard from `state.users` instead of `state.tagPlayers`
- **Where:** `src/app/api/update-discord/route.ts`
- **Issue:** `Object.values(state.users).sort(...)` — the `users` collection is populated by Discord sync and Twitch auth, NOT by the tag game. Tag game players are in `tagPlayers`. So the Discord leaderboard shows the wrong data (users who may not even be in the game, with scores of 0).
- **Fix:** Read from `state.tagPlayers` and compute scores from `tagHistory`, same as the `/api/tag` GET handler does.

### 10. Session signing fallback
- **Where:** `src/lib/session.ts`
- **Issue:** `const SECRET = process.env.NEXTAUTH_SECRET || process.env.BOT_SECRET_KEY || 'chat-tag-default-secret'` — if both env vars are missing, sessions are signed with a known string. On Fly.io this is fine if `BOT_SECRET_KEY` is set in secrets, but worth verifying it's actually set.
- **Fix:** Check that `BOT_SECRET_KEY` is set in Fly.io secrets. Optionally remove the hardcoded fallback and throw if missing.

---

## 🟡 MEDIUM — Needs Cleanup

### 11. Twitch auth redirect URI mismatch
- **Files:** `src/app/api/auth/twitch/route.ts` vs `src/app/api/auth/twitch/callback/route.ts`
- **Issue:** Auth initiation hardcodes `redirect_uri: 'https://chat-tag-new.fly.dev/api/auth/twitch/callback'`, but the callback constructs it dynamically from `appUrl`. If these differ, token exchange fails.
- **Fix:** Use a single env var or always derive from request origin.

### 12. Hardcoded username `mtman1987` in multiple places
- **Files:** `chat-tag-game.tsx` (default state), `leaderboard.tsx` (filtered out), `bot.js` (admin check)
- **Fix:** Move admin usernames to env var. Remove hardcoded default user.

### 13. Duplicate bingo phrase data
- **Files:** `src/lib/data.ts` and `src/lib/bingo-data.ts` both export `commonBingoPhrases` with different lists
- **Fix:** Delete `src/lib/data.ts`.

### 14. `BingoGame` component is dead code
- **File:** `src/components/bingo-game.tsx` — never imported, duplicates `bingo-card.tsx` with hardcoded test user
- **Fix:** Delete it.

### 15. Aggressive polling — 6+ components all polling independently
- `chat-tag-game.tsx`: 5s, `community-list.tsx`: 10s, `main-dashboard.tsx`: 15s, `bot-channel-manager.tsx`: 10s, `leaderboard.tsx`: 30s, `activity-feed.tsx`: 30s
- **Fix:** Consolidate into a single data context or use the existing `ws-server.js` for real-time updates.

### 16. `console.log` debug statements in production components
- **Files:** `leaderboard.tsx` (3 logs dumping full player data), various API routes
- **Fix:** Remove from components. Keep structured logging in API routes.

### 17. Mock/placeholder data in components
- **Files:** `chat-tag-game.tsx`, `community-list.tsx` — hardcoded `mockPlayers` with picsum URLs
- **Fix:** Show proper empty states instead.

### 18. Discord Guild ID fallback is wrong
- **File:** `src/app/api/discord/members/route.ts` — fallback is `'1279582181768957963'` (the client ID, not guild ID)
- **Fix:** Remove fallback or fix to `1240832965865635881`.

### 19. Package name is `"nextn"` instead of `"chat-tag"`
- **File:** `package.json`
- **Fix:** Rename.

### 20. `next.config.ts` suppresses all TypeScript and ESLint errors
- **Fix:** Enable after cleanup is done.

### 21. `onKeyPress` deprecated in React
- **File:** `bot-channel-manager.tsx`
- **Fix:** Replace with `onKeyDown`.

### 22. Bot writes tokens to `.env` file (lost on Fly.io redeploy)
- **File:** `bot.js` `updateEnvToken()`
- **Fix:** Store refreshed tokens in volume-store or Fly.io secrets.

### 23. Bot used `global.*` for pagination state (fixed)
- **File:** `bot.js` — player/live pagination and last-list command state
- **Fix:** Replaced global object caches with bounded Maps that expire stale users and cap retained entries.

### 24. Tailwind config references nonexistent `./src/pages/**`
- **File:** `tailwind.config.ts`
- **Fix:** Remove the pages content path.

### 25. Mixed line endings (CRLF/LF)
- **Fix:** Add `.editorconfig` to enforce LF.

---

## 🔵 LOW — Dead Code & Cleanup

### 26. Root-level utility scripts archived
- **Moved:** one-off maintenance/test scripts now live in `scripts/legacy-root/` with README notes.
- **Still at root intentionally:** `bot.js`, `migrate-data.js`, and `ws-server.js` remain package/runtime entry points until those legacy paths are removed separately.

### 27. Unused `src/ai/` directory (genkit files)
- **Fix:** Delete `src/ai/dev.ts` and `src/ai/genkit.ts`. Remove `genkit`, `@genkit-ai/*`, `genkit-cli` from package.json.

### 28. Unused docs
- `src/docs/backend.json`, `docs/backend.json`, stale `TODO.md`, `BUTTON_FIXES.md`, `CHANGES.md`
- **Fix:** Delete or update.

### 29. `TwitchLoginButton.tsx` likely unused (header uses direct redirect)
- **Fix:** Verify and delete.

### 30. Unused dependencies
- Candidates: `@genkit-ai/*`, `genkit`, `genkit-cli`, `patch-package`, `firebase`, `firebase-admin`, `tmi.js` (only in bot.js, not Next.js), `ws` (ws-server.js unused)
- **Fix:** Audit with `npx depcheck`.

### 31. `BingoCell` has unused `players` and `claimerId` props
- **Fix:** Remove unused props.

### 32. `data.ts` has unused `Player` import
- **Fix:** Delete the file (see #13).

### 33. `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json` — all dead
- **Fix:** Delete (see #6).

---

## ✅ TODO — Prioritized Fix List

### Admin Scripts & Maintenance

**Prune orphaned bot channels** (removes botChannel entries with no matching player):
- **From CLI:** `node scripts/prune-orphaned-channels.js` (creates backup first)
- **From API:** `POST /api/admin/prune-channels` → returns `{ pruned, before, after, players }`

**Fix missing avatars & merge duplicate players:**
- **From API:** `POST /api/admin/fix-players` → fetches Twitch avatars, merges manual_ duplicates, syncs bot channels
- **Run after deploy** to backfill any existing players with empty avatars

---

### Phase 1: Data Sync & Single Source of Truth
- [x] Establish `state.tagPlayers` as THE canonical player list
- [x] Make community list component read from `tagPlayers` (via `/api/tag`), not `botChannels`
- [x] Derive `botChannels` from `tagPlayers` — auto-add on join, auto-remove on leave
- [x] Add a one-time cleanup script to prune `botChannels` entries with no matching `tagPlayer`
- [x] Fix `leave` action to also clear `currentIt`, remove bot channel, and trigger auto-rotate if needed
- [x] Fix `tag` action to verify both tagger and target still exist before processing
- [x] Fix `update-discord` route to read from `tagPlayers` instead of `users`
- [x] Fix `bot/channels/remove` to NOT delete players (only remove channel entry)
- [x] Fix `join` action to auto-fetch Twitch avatar via Helix when none provided
- [x] Create shared `src/lib/twitch.ts` helper for Helix user lookups

### Phase 2: Discord Integration Fixes
- [x] Add confirmation message to Discord webhook when a tag happens (not just DSH refresh)
- [x] Discord text commands work via Kite → DSH `/api/discord/chat` → `handleSpmtCommand` pipeline
- [x] Fix `sendDiscordReply` — was failing silently (no error logging) and auto-deleting replies after 60s
- [x] Add Join, Status, Sleep/Wake buttons + Full Game link to Discord embed
- [x] Add button handlers for Join, Status, Sleep/Wake in DSH interactions route
- [x] Fix logs — now reads from volume-store admin/mod history + bot health endpoint
- [x] Fix DSH `fetchLogs` to handle plain text response from updated logs route
- [x] Add channelId logging to DSH chat route for debugging Kite payload issues

### Phase 3: Avatar & Player Creation Fixes
- [x] Add Twitch Helix avatar lookup in the API `join` handler when no avatar is provided (done in Phase 1)
- [x] Extract the Helix user lookup into shared `src/lib/twitch.ts` helper (done in Phase 1)
- [x] UI "Add Player" and DSH join both send `avatar: ''` — API now auto-fetches from Twitch
- [x] Refactored `fix-players` admin route to use shared `twitch.ts` helper
- [ ] Run `POST /api/admin/fix-players` once after deploy to backfill missing avatars for existing players

### Phase 4: Firebase/Firestore Scrub
- [x] Delete `src/firebase/` directory entirely (11 files)
- [x] Delete `src/lib/firebase-admin.ts`
- [x] Delete `src/components/FirebaseErrorListener.tsx`
- [x] Delete `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `.firebaserc`
- [x] Remove `firebase` and `firebase-admin` from `package.json`
- [x] Update `src/lib/types.ts` — removed Timestamp/FieldValue imports, all timestamps are `number` now
- [x] Remove `AdminPlayer`, `AdminChatTagEvent`, `AdminBingoWinEvent` types (Firestore-only)
- [x] Remove `@genkit-ai/*`, `genkit`, `genkit-cli` from package.json
- [x] Delete `src/ai/dev.ts` and `src/ai/genkit.ts`
- [x] Remove dead genkit/firestore scripts from package.json
- [x] Fix package name `"nextn"` → `"chat-tag"`

### Phase 5: Dead Code & Cleanup
- [x] Remove `@` prefix requirement from all command references — added to TODO for later sweep
- [x] Delete `src/components/bingo-game.tsx`
- [x] Delete `src/lib/data.ts` (duplicate bingo phrases)
- [x] Delete `src/docs/backend.json` and `docs/backend.json`
- [x] Verify and delete `src/components/TwitchLoginButton.tsx` (header has its own login button)
- [x] Move or delete stale docs (TODO.md, BUTTON_FIXES.md, CHANGES.md)
- [x] Remove mock/placeholder data from `chat-tag-game.tsx` and `community-list.tsx`
- [x] Remove `console.log` debug statements from `leaderboard.tsx`
- [x] Remove hardcoded `mtman1987` filter from leaderboard
- [x] Remove hardcoded `mtman1987` default username from `chat-tag-game.tsx`
- [x] Fix `onKeyPress` → `onKeyDown` in `bot-channel-manager.tsx`
- [x] Fix package name `"nextn"` → `"chat-tag"` (done in Phase 4)
- [x] Remove `./src/pages/**` from Tailwind content paths
- [x] Fix Discord Guild ID fallback (removed wrong fallback)
- [x] Fix Twitch auth redirect URI mismatch (now uses env var / request origin)
- [x] Add `.editorconfig` for line endings
- [x] Clean up unused `BingoCell` props (claimerId, players, Avatar imports)
- [x] Verify `BOT_SECRET_KEY` is set in env (it is: `1234`)
- [ ] Update help text, about page, bot replies, and embed footer to show `spmt` instead of `@spmt` (future sweep)
- [x] Replace `global.*` pagination in bot.js with bounded Maps and TTL
- [x] Move root-level utility scripts to `scripts/legacy-root/` with README notes

### Cross-Platform Discord Integration (completed)
- [x] DSH `/api/discord/chat` now sends `chat-activity` to chat-tag API with `channel: 'discord'`
- [x] Discord chatters auto-wake from sleep/offline immunity when they message
- [x] Discord chatters show in `spmt live` output as `🟣Discord > 💬user1, user2`
- [x] Bot.js `live` and `more` commands updated to include Discord active users
- [x] DSH `live` command rewritten with full Twitch+Discord grouped output
- [x] Removed Bingo and Full Game buttons from Discord embed (admin-only / not ready)
- [x] Added `givepass`, `players`, `live`, `stats`, `rules`, `newcard`, `pinrank` commands to DSH
- [x] Added Pin's special tag tracking to DSH Discord handler
- [x] Fixed DSH `sendDiscordReply` — 5-min auto-cleanup of both bot reply and user's original message
- [x] Fixed DSH `awardPoints` — `FieldValue.increment` replaced with read-then-write for SQLite compat
- [x] Added admin buttons to settings page: Fix Players, Prune Channels, Download Logs
