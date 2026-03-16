const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load .env.local
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

async function fixUser() {
  const userId = 'user_549531897';
  const correctUsername = 'mrmonstermunch2000';
  
  // Update Firebase
  await db.collection('chatTags').doc(userId).update({
    twitchUsername: correctUsername
  });
  
  console.log(`✅ Fixed ${userId} -> ${correctUsername}`);
  process.exit(0);
}

fixUser().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
