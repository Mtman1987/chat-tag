# Fly.io Volume Migration

This project now supports file-backed runtime state on Fly volumes instead of Firestore for game/bot APIs.

## 1. Create Fly volume (one-time)

```bash
fly volumes create chat_tag_data --region iad --size 3
```

If you run multiple machines, create one volume per machine/region.

## 2. Confirm mount

`fly.toml` now mounts the volume at `/data` and sets `DATA_DIR=/data`.

## 3. Migrate existing data

Local files only:

```bash
npm run migrate:volume
```

Local files + Firestore (optional):

```bash
npm run migrate:volume:firestore
```

Required env vars for Firestore import:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

## 4. Deploy

```bash
fly deploy
```

## 5. Runtime data file

The app writes state to:

- `/data/app-state.json` on Fly
- `./data/app-state.json` locally when `DATA_DIR` is not set

## Notes

- Most server APIs now use the volume store.
- `src/app/api/auth/twitch/callback/route.ts` still uses Firebase Auth for custom-token login.