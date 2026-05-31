const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '.env.local');
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

const serviceAccount = {
  projectId: env.FIREBASE_PROJECT_ID,
  clientEmail: env.FIREBASE_CLIENT_EMAIL,
  privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function updatePlayerUsernames() {
  try {
    const playersSnap = await db.collection('tagPlayers').get();
    console.log(`Found ${playersSnap.docs.length} players`);
    
    const clientId = env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
    const clientSecret = env.TWITCH_CLIENT_SECRET;
    
    // Get app access token
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials'
      })
    });
    const { access_token } = await tokenRes.json();
    
    let updated = 0;
    let failed = 0;
    
    for (const doc of playersSnap.docs) {
      const playerId = doc.id;
      const twitchId = playerId.replace('user_', '');
      
      try {
        const userRes = await fetch(`https://api.twitch.tv/helix/users?id=${twitchId}`, {
          headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${access_token}`
          }
        });
        
        const userData = await userRes.json();
        
        if (userData.data && userData.data[0]) {
          const user = userData.data[0];
          await doc.ref.update({
            twitchUsername: user.display_name,
            avatarUrl: user.profile_image_url
          });
          console.log(`✓ Updated ${playerId} -> ${user.display_name}`);
          updated++;
        } else {
          console.log(`✗ No Twitch user found for ${playerId}`);
          failed++;
        }
        
        // Rate limit
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        console.error(`✗ Error updating ${playerId}:`, e.message);
        failed++;
      }
    }
    
    console.log(`\nDone! Updated: ${updated}, Failed: ${failed}`);
    process.exit(0);
  } catch (error) {
    console.error('Script error:', error);
    process.exit(1);
  }
}

updatePlayerUsernames();
