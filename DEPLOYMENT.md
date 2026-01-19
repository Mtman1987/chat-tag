# Chat Tag Game - Firebase Deployment Guide

## Overview
This is a standalone version of the Chat Tag game designed for Firebase App Hosting. It includes:
- Next.js web application with Firebase integration
- Standalone Twitch bot service
- Firestore database for game state
- Discord webhook integration

## Prerequisites
1. Firebase project created
2. Twitch application registered (for bot credentials)
3. Discord webhook URL (optional, for announcements)

## Setup Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Firebase
1. Go to Firebase Console: https://console.firebase.google.com
2. Create a new project or select existing
3. Enable Firestore Database
4. Enable Authentication > Twitch provider
5. Get your Firebase config from Project Settings

### 3. Configure Environment Variables
Copy `.env.local` and fill in all values:

**Required:**
- `NEXT_PUBLIC_FIREBASE_*` - Firebase web config
- `FIREBASE_PROJECT_ID` - For bot service
- `FIREBASE_CLIENT_EMAIL` - Service account email
- `FIREBASE_PRIVATE_KEY` - Service account private key
- `TWITCH_BOT_USERNAME` - Your bot's Twitch username
- `TWITCH_BOT_TOKEN` - OAuth token (get from https://twitchapps.com/tmi/)
- `TWITCH_CLIENT_ID` - Twitch app client ID
- `TWITCH_CLIENT_SECRET` - Twitch app client secret

**Optional:**
- `DISCORD_WEBHOOK_URL` - For Discord announcements
- `DISCORD_INVITE_LINK` - Discord server invite

### 4. Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 5. Initialize Game Settings
Create a document in Firestore:
- Collection: `gameSettings`
- Document ID: `default`
- Fields:
  ```json
  {
    "tagSuccessPoints": 100,
    "tagPenaltyPoints": 50,
    "discordWebhookUrl": "your_webhook_url",
    "discordLeaderboardMessageId": "",
    "bingoCardsCompleted": 0,
    "externalApiUrl": ""
  }
  ```

### 6. Deploy Next.js App
For Firebase App Hosting:
```bash
npm run build
firebase deploy --only hosting
```

For other platforms (Vercel, Railway, etc.):
```bash
npm run build
npm start
```

### 7. Run the Bot Service
The bot needs to run 24/7 on a server. Options:

**Option A: Railway/Render/Fly.io**
1. Create new service
2. Connect to this repository
3. Set build command: `npm install`
4. Set start command: `npm run bot`
5. Add all environment variables

**Option B: Local/VPS**
```bash
npm run bot
```

## Architecture

```
┌─────────────────────────────────────────┐
│         Firebase App Hosting            │
│  ┌───────────────────────────────────┐  │
│  │      Next.js Application          │  │
│  │  - Web UI                         │  │
│  │  - API Routes                     │  │
│  │  - Twitch Auth                    │  │
│  └───────────────┬───────────────────┘  │
│                  │                       │
│  ┌───────────────▼───────────────────┐  │
│  │      Firestore Database           │  │
│  │  - users (players)                │  │
│  │  - chatTags (tag events)          │  │
│  │  - bingoEvents (bingo wins)       │  │
│  │  - gameSettings                   │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│      Separate Bot Service               │
│      (Railway/Render/VPS)               │
│  ┌───────────────────────────────────┐  │
│  │      Twitch IRC Bot (bot.js)      │  │
│  │  - Connects to Twitch IRC         │  │
│  │  - Listens for @spmt commands     │  │
│  │  - Updates Firestore              │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Bot Commands
Players can use these commands in any Twitch chat:
- `@spmt join` - Join the tag game
- `@spmt tag @username` - Tag another player (when you're "it")
- `@spmt status` - Check who is currently "it"
- `@spmt help` - Show available commands

## Cost Estimates

### Minimal Setup (Hobby)
- Firebase (Spark Plan): Free
  - 50K reads/day
  - 20K writes/day
  - 1GB storage
- Railway (Bot): $5/month
- **Total: $5/month**

### Production Setup
- Firebase (Blaze Plan): ~$25/month
  - Pay as you go
  - More capacity
- Railway (Bot): $10/month
- **Total: ~$35/month**

## Monitoring
- Firebase Console: Monitor database usage
- Railway Dashboard: Monitor bot uptime
- Discord: Receive game event notifications

## Troubleshooting

### Bot not connecting
- Check `TWITCH_BOT_TOKEN` is valid
- Verify bot account exists on Twitch
- Check Firebase credentials are correct

### Players not syncing
- Verify Firestore rules allow authenticated reads/writes
- Check Firebase indexes are deployed
- Verify API routes are accessible

### Tags not working
- Check Firestore security rules
- Verify game state in Firestore console
- Check browser console for errors

## Support
Refer to TAG_GAME_CLOUD_HOSTING_GUIDE.txt for detailed architecture information.
