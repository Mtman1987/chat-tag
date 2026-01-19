# Chat Tag - Quick Reference

## Local Development

### Start Everything
```bash
start.bat
```

### Manual Start
```bash
npm run dev    # Next.js on port 9002
npm run bot    # Twitch bot
```

## Firebase Deployment

### First Time Setup
```bash
npm install -g firebase-tools
firebase login
firebase init
```

### Deploy Database
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### Deploy App
```bash
npm run build
firebase deploy --only hosting
```

## Bot Deployment (Railway)

1. Go to https://railway.app
2. New Project > Deploy from GitHub
3. Select `chat-tag` repository
4. Add environment variables (see below)
5. Set start command: `npm run bot`

## Environment Variables

### .env.local (for Next.js)
```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
NEXT_PUBLIC_TWITCH_CLIENT_ID=
```

### Railway (for Bot)
```env
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
TWITCH_BOT_USERNAME=
TWITCH_BOT_TOKEN=
DISCORD_WEBHOOK_URL=
```

## Bot Commands

| Command | Description |
|---------|-------------|
| `@spmt join` | Join the tag game |
| `@spmt tag @user` | Tag another player (when you're "it") |
| `@spmt status` | Check who is currently "it" |
| `@spmt help` | Show available commands |

## File Structure

```
chat-tag/
├── bot.js                    # Twitch bot service
├── src/app/api/
│   ├── tag/route.ts         # Tag game API
│   ├── bot/channels/        # Bot channels API
│   ├── sync-community/      # Sync players
│   └── update-discord/      # Discord updates
├── firebase.json            # Firebase config
├── firestore.rules          # Database rules
├── firestore.indexes.json   # Database indexes
└── .env.local              # Environment variables
```

## Useful Commands

```bash
# Install dependencies
npm install

# Run locally
npm run dev
npm run bot

# Build for production
npm run build

# Deploy to Firebase
firebase deploy

# View Firebase logs
firebase functions:log

# Test Firestore rules
firebase emulators:start
```

## Getting Credentials

### Firebase
1. Console: https://console.firebase.google.com
2. Project Settings > General (web config)
3. Project Settings > Service Accounts (admin key)

### Twitch
1. Bot OAuth: https://twitchapps.com/tmi/
2. App Console: https://dev.twitch.tv/console/apps

### Discord
1. Server Settings > Integrations > Webhooks
2. Create webhook > Copy URL

## Troubleshooting

### Bot not connecting
- Check `TWITCH_BOT_TOKEN` is valid
- Verify bot username is correct
- Check Firebase credentials

### Players not loading
- Verify Firestore rules are deployed
- Check Firebase indexes
- Check browser console

### Tags not working
- Verify user is authenticated
- Check Firestore permissions
- View API route logs

## Monitoring

- **Firebase Console**: Database usage, hosting analytics
- **Railway Dashboard**: Bot logs, service health
- **Discord**: Game event notifications

## Cost Estimates

### Free Tier
- Firebase: 50K reads/day, 20K writes/day
- Railway: $5 credit/month
- **Total: $0-5/month**

### Production
- Firebase: ~$25/month
- Railway: $10/month
- **Total: ~$35/month**

## Documentation

- `SETUP.md` - Quick start guide
- `DEPLOYMENT.md` - Full deployment guide
- `CHANGES.md` - What was implemented
- `README.md` - Game design document
- `TAG_GAME_CLOUD_HOSTING_GUIDE.txt` - Architecture details

## Support

For issues or questions:
1. Check documentation files
2. Review Firebase console logs
3. Check Railway/Render service logs
4. Test locally first
