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

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  })
});

const db = admin.firestore();

async function migrateTagHistory() {
  const tagStats = JSON.parse(fs.readFileSync('./tag-stats.json', 'utf8'));
  
  const batch = db.batch();
  let count = 0;
  
  for (const tag of tagStats.tags) {
    // Skip tags with missing data
    if (!tag.from || !tag.to || !tag.timestamp) continue;
    
    const docRef = db.collection('tagHistory').doc();
    batch.set(docRef, {
      taggerId: tag.from,
      taggedId: tag.to,
      timestamp: admin.firestore.Timestamp.fromMillis(tag.timestamp),
      streamerId: tag.channel?.replace('#', '') || 'unknown',
      doublePoints: tag.doublePoints || false,
      blocked: tag.blocked || null
    });
    
    count++;
    if (count % 500 === 0) {
      await batch.commit();
      console.log(`Migrated ${count} tags...`);
    }
  }
  
  if (count % 500 !== 0) {
    await batch.commit();
  }
  
  console.log(`Migration complete: ${count} tags migrated`);
}

migrateTagHistory().catch(console.error);