# Setting Environment Variables in Firebase App Hosting

## Method 1: Firebase Console (Recommended)

1. Go to Firebase Console: https://console.firebase.google.com/
2. Select your project: `studio-2048835775-ef8ab`
3. Go to **App Hosting** in the left sidebar
4. Click on your app
5. Go to **Settings** or **Environment Variables**
6. Add these variables:

### Required Environment Variables:

```
TWITCH_BOT_USERNAME=your_bot_username
TWITCH_BOT_TOKEN=your_bot_oauth_token
TWITCH_BROADCASTER_USERNAME=your_broadcaster_username
TWITCH_BROADCASTER_TOKEN=your_broadcaster_oauth_token

TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
NEXT_PUBLIC_TWITCH_CLIENT_ID=your_client_id

DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_WEBHOOK_URL=your_discord_webhook_url
DISCORD_INVITE_LINK=https://discord.gg/your-invite

FIREBASE_PROJECT_ID=studio-2048835775-ef8ab
FIREBASE_CLIENT_EMAIL=your_service_account_email
FIREBASE_PRIVATE_KEY=your_private_key_with_newlines

NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=studio-2048835775-ef8ab
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

NEXTAUTH_URL=https://your-app-url.web.app
NEXTAUTH_SECRET=generate_random_secret_here
```

## Method 2: Firebase CLI

```bash
firebase apphosting:secrets:set TWITCH_BOT_USERNAME
firebase apphosting:secrets:set TWITCH_BOT_TOKEN
firebase apphosting:secrets:set FIREBASE_PRIVATE_KEY
# ... repeat for each secret
```

## Method 3: Add to firebase.json

Add this to your `firebase.json`:

```json
{
  "hosting": {
    "public": "out",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  },
  "apphosting": {
    "env": {
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID": "studio-2048835775-ef8ab"
    }
  }
}
```

## Important Notes:

1. **NEXT_PUBLIC_*** variables are exposed to the client - only put non-sensitive data here
2. **FIREBASE_PRIVATE_KEY** needs to preserve newlines - in Firebase console, paste the entire key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
3. After setting env vars, redeploy: `firebase deploy`
4. For the bot to work, you need to run `node bot.js` separately (not deployed to Firebase) OR deploy it as a Cloud Function

## Running the Bot:

The bot (`bot.js`) needs to run continuously. Options:

### Option A: Run locally
```bash
node bot.js
```

### Option B: Deploy as Cloud Run service
1. Create `Dockerfile` for bot
2. Deploy to Cloud Run
3. Keep it running 24/7

### Option C: Use a VPS/server
1. Upload bot.js to a server
2. Use PM2 or systemd to keep it running
3. Set environment variables on the server
