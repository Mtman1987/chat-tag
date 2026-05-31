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

async function calculateScores() {
  const historySnap = await db.collection('tagHistory').get();
  const tagCounts = {};
  
  historySnap.docs.forEach(doc => {
    const data = doc.data();
    const from = data.taggerId;
    const to = data.taggedId;
    
    if (from && from !== 'system') {
      if (!tagCounts[from]) tagCounts[from] = { tags: 0, tagged: 0 };
      tagCounts[from].tags++;
    }
    if (to && to !== 'system' && to !== 'free-for-all') {
      if (!tagCounts[to]) tagCounts[to] = { tags: 0, tagged: 0 };
      tagCounts[to].tagged++;
    }
  });
  
  const playersSnap = await db.collection('tagPlayers').get();
  const batch = db.batch();
  
  playersSnap.docs.forEach(doc => {
    const counts = tagCounts[doc.id] || { tags: 0, tagged: 0 };
    const score = (counts.tags * 100) - (counts.tagged * 50);
    batch.update(doc.ref, { score, tags: counts.tags, tagged: counts.tagged });
  });
  
  await batch.commit();
  console.log(`Updated scores for ${playersSnap.docs.length} players`);
}

calculateScores().catch(console.error);
