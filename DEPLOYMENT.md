# Chat Tag Production Deployment Runbook

This project now deploys to **Fly.io** as two single-machine apps backed by local/volume state. The old Firebase/Firestore deployment notes are no longer the production path.

## Production apps

| App | Fly app | Config | Runtime notes |
| --- | --- | --- | --- |
| Web/API | `chat-tag-new` | `fly.toml` | Next.js app on port `3000`; state persists on the `chat_tag_data` Fly volume mounted at `/data`. |
| Twitch bot | `chat-tag-bot-new` | `fly-bot.toml` | `node bot.js` on port `8091`; must run as one machine to avoid duplicate chat connections/messages. |

## Branch and remote preflight

1. Confirm the working tree is clean:
   ```bash
   git status --short --branch
   ```
2. Confirm a GitHub remote exists before treating local production work as safely backed up:
   ```bash
   git remote -v
   ```
3. Fetch and compare the intended deploy branch before pushing or deploying:
   ```bash
   git fetch --all --prune
   git log --oneline --decorate --graph --max-count=20 --all
   ```
4. If this checkout still has no remote configured, add the correct GitHub remote and push the current work branch or open a PR before deploying.

## Required validation before deploy

Run these from the repo root:

```bash
npm install
npm run typecheck
npm run build
node --check bot.js
```

Do not deploy if typecheck or build fails. `next.config.ts` currently skips type/lint validation during `next build`, so `npm run typecheck` is a separate required gate.

## Secrets and environment checklist

Confirm these values exist in Fly secrets or runtime environment before deploying:

### Shared / web app
- `BOT_SECRET_KEY` — shared secret for bot-to-web API calls.
- `PUBLIC_APP_ORIGIN` or the production public URL used by Discord embeds and user-facing links.
- `INTERNAL_APP_ORIGIN` — internal web origin used for server-to-server/self calls when needed.
- `DATA_DIR=/data` — configured in `fly.toml`; do not remove while volume-backed state is in use.

### Twitch
- `TWITCH_BOT_USERNAME`
- `TWITCH_BOT_TOKEN`
- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `NEXT_PUBLIC_TWITCH_CLIENT_ID` when required by the browser auth flow.

### Discord / DSH / Kite
- `DISCORD_BOT_TOKEN`
- `DISCORD_WEBHOOK_URL` or `DISCORD_TAG_WEBHOOK_URL`
- `CHAT_TAG_WEBHOOK_NAME` / `CHAT_TAG_AVATAR_URL` if customized.
- `DSH_API_BASE` or DSH URL variables used by the current deployment.

Use Fly to review/set secrets without printing secret values into logs:

```bash
fly secrets list -a chat-tag-new
fly secrets list -a chat-tag-bot-new
fly secrets set KEY=value -a chat-tag-new
fly secrets set KEY=value -a chat-tag-bot-new
```

## Deploy commands

Deploy the web/API app:

```bash
fly deploy --config fly.toml --ha=false -a chat-tag-new
fly scale count 1 -a chat-tag-new --yes
fly machines list -a chat-tag-new
```

Deploy the bot app:

```bash
fly deploy --config fly-bot.toml --ha=false -a chat-tag-bot-new
fly scale count 1 -a chat-tag-bot-new --yes
fly machines list -a chat-tag-bot-new
```

Only one web machine should be running because the app uses one mounted volume for state. Only one bot machine should be running because two bots can both connect to Twitch/Discord and send duplicate messages.

The GitHub Actions Fly deploy workflow also deploys with `--ha=false`, scales both apps to one machine, and prints machine lists when it runs from `main` or manual `workflow_dispatch`.

## Post-deploy repair and smoke tests

### One-time data repair after deploy

Run the player repair endpoint once after a successful deploy to backfill missing avatars, merge duplicate/manual players, and sync bot-channel data:

```bash
curl -X POST https://chat-tag-new.fly.dev/api/admin/fix-players \
  -H "Authorization: Bearer <admin-session-token>" \
  -H "Content-Type: application/json"
```

If authorization changes, use the current admin/session mechanism rather than weakening the route.

### Discord smoke test

In the real production Discord channel, verify:

- `spmt help`
- `spmt join`
- `spmt status`
- `spmt tag <user>`
- `spmt pass <user>`
- `spmt live`
- `spmt players`
- `spmt score`
- `spmt rank`
- `spmt pack`
- `spmt away`

Confirm replies are embeds, mentions are not mass-pinging users, pack previews render, and cleanup timing is acceptable.

### Twitch smoke test

In Twitch chat, verify:

- `spmt help`
- `spmt join`
- `spmt status`
- `spmt tag <user>`
- `spmt pass <user>`
- `spmt live`
- `spmt players`
- `spmt score`
- `spmt rank`
- `spmt pack`
- `spmt away`

Confirm Discord-active users appear in `spmt live` without breaking Twitch live grouping.

### Logs and health checks

```bash
fly logs -a chat-tag-new
fly logs -a chat-tag-bot-new
curl -I https://chat-tag-new.fly.dev/
curl https://chat-tag-bot-new.fly.dev/health
```

Also check the app mod/admin logs after auto-rotate, away toggles, fix/prune actions, or support tickets.

## Rollback

1. Identify the last known-good image/release:
   ```bash
   fly releases -a chat-tag-new
   fly releases -a chat-tag-bot-new
   ```
2. Roll back the affected app:
   ```bash
   fly releases rollback <version> -a chat-tag-new
   fly releases rollback <version> -a chat-tag-bot-new
   ```
3. Reconfirm single-machine counts:
   ```bash
   fly scale count 1 -a chat-tag-new --yes
   fly scale count 1 -a chat-tag-bot-new --yes
   ```
4. Repeat the Discord/Twitch smoke tests for the impacted command paths.

## Known production risks still tracked in `AUDIT.md`

- Restore/push Git remote state before production deploys from local-only work.
- Finish shared command extraction so Discord and Twitch command logic cannot drift.
- Finish server-side role authorization and move dangerous controls to an `/admin` surface.
- Prune/archive remaining root utility scripts.
