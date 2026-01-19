# Chat Tag - Cloud Hosting Setup

## Quick Start (Local Testing)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure `.env.local`:**
   - Add your Firebase credentials
   - Add Twitch bot credentials
   - Add Discord webhook (optional)

3. **Run locally:**
   ```bash
   start.bat
   ```
   Or manually:
   ```bash
   npm run dev    # Terminal 1
   npm run bot    # Terminal 2
   ```

## Firebase App Hosting Deployment

### Step 1: Firebase Setup
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize project
firebase init
# Select: Firestore, Hosting
# Use existing project or create new
```

### Step 2: Deploy Database Rules
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### Step 3: Build and Deploy App
```bash
npm run build
firebase deploy --only hosting
```

### Step 4: Deploy Bot Service
The bot needs to run separately. Choose one:

**Option A: Railway**
1. Go to https://railway.app
2. New Project > Deploy from GitHub
3. Select this repository
4. Add environment variables
5. Set start command: `npm run bot`

**Option B: Render**
1. Go to https://render.com
2. New > Background Worker
3. Connect repository
4. Build: `npm install`
5. Start: `npm run bot`

**Option C: Fly.io**
1. Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
2. Create `fly.toml`:
   ```toml
   app = "chat-tag-bot"
   
   [build]
     builder = "heroku/buildpacks:20"
   
   [[services]]
     internal_port = 8080
     protocol = "tcp"
   
   [env]
     NODE_ENV = "production"
   ```
3. Deploy: `fly deploy`

## Environment Variables

### For Next.js App (Firebase Hosting)
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

### For Bot Service (Railway/Render/Fly.io)
```env
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
TWITCH_BOT_USERNAME=
TWITCH_BOT_TOKEN=
DISCORD_WEBHOOK_URL=
```

## Getting Credentials

### Firebase
1. Go to Firebase Console
2. Project Settings > General
3. Copy web app config
4. Project Settings > Service Accounts
5. Generate new private key (for bot)

### Twitch Bot
1. Create Twitch account for bot
2. Get OAuth token: https://twitchapps.com/tmi/
3. Register app: https://dev.twitch.tv/console/apps
4. Get Client ID and Secret

### Discord Webhook
1. Go to Discord Server Settings
2. Integrations > Webhooks
3. Create webhook
4. Copy webhook URL

## Testing

### Local Testing
```bash
# Terminal 1: Start Next.js
npm run dev

# Terminal 2: Start bot
npm run bot

# Open browser
http://localhost:9002
```

### Production Testing
1. Deploy app to Firebase
2. Deploy bot to Railway/Render
3. Test commands in Twitch chat:
   - `@spmt join`
   - `@spmt status`
   - `@spmt help`

## Monitoring

### Firebase Console
- Monitor Firestore reads/writes
- Check authentication logs
- View hosting analytics

### Bot Service Dashboard
- Railway: Check logs and metrics
- Render: Monitor service health
- Fly.io: View app status

## Troubleshooting

### Bot not responding
1. Check bot service is running
2. Verify Twitch token is valid
3. Check Firebase credentials
4. View bot service logs

### Players not loading
1. Check Firestore rules
2. Verify indexes are deployed
3. Check browser console
4. Verify Firebase config

### Tags not working
1. Check user is authenticated
2. Verify Firestore permissions
3. Check API route logs
4. Test in Firestore console

## Architecture

```
User Browser
    ↓
Firebase Hosting (Next.js)
    ↓
Firestore Database
    ↑
Bot Service (Railway/Render)
    ↑
Twitch IRC
```

## Cost Breakdown

### Free Tier (Testing)
- Firebase Spark: Free
- Railway: $5 credit/month
- **Total: $0-5/month**

### Production
- Firebase Blaze: ~$25/month
- Railway Pro: $10/month
- **Total: ~$35/month**

## Next Steps

1. ✅ Set up Firebase project
2. ✅ Configure environment variables
3. ✅ Deploy Firestore rules
4. ✅ Deploy Next.js app
5. ✅ Deploy bot service
6. ✅ Test in Twitch chat
7. ✅ Monitor usage

For detailed information, see:
- `DEPLOYMENT.md` - Full deployment guide
- `TAG_GAME_CLOUD_HOSTING_GUIDE.txt` - Architecture details
- `README.md` - Game design document
