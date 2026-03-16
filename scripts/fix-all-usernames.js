const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=:#]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
});

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  })
});

const db = admin.firestore();

async function fixAllPlayers() {
  const snapshot = await db.collection('chatTags').where('isPlayer', '==', true).get();
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const userId = doc.id;
    
    // Check if username is missing or looks wrong
    if (!data.twitchUsername || data.twitchUsername.startsWith('user_')) {
      const twitchId = userId.replace('user_', '');
      
      // Look up from Twitch API
      const res = await fetch(`https://api.twitch.tv/helix/users?id=${twitchId}`, {
        headers: {
          'Client-ID': env.NEXT_PUBLIC_TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${env.TWITCH_BOT_TOKEN}`
        }
      });
      
      const userData = await res.json();
      if (userData.data?.[0]) {
        const username = userData.data[0].display_name;
        await doc.ref.update({ twitchUsername: username });
        console.log(`✅ Fixed ${userId} -> ${username}`);
      } else {
        console.log(`❌ ${userId} not found on Twitch`);
      }
    }
  }
  
  console.log('Done!');
  process.exit(0);
}

fixAllPlayers().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
