const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=:#]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
});

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  })
});

const db = admin.firestore();

async function initializeScores() {
  console.log('[Init Scores] Starting...');
  
  // Load streamweaver scores
  const tagStatsPath = 'c:\\Users\\mtman\\Desktop\\Enviroment\\streamweaver-v2-main\\data\\tag-stats.json';
  const tagStats = JSON.parse(fs.readFileSync(tagStatsPath, 'utf8'));
  
  // Create score map from streamweaver data
  const scoreMap = {};
  tagStats.players.forEach(p => {
    scoreMap[p.id] = p.score || 0;
  });
  
  console.log(`[Init Scores] Loaded ${tagStats.players.length} players from streamweaver`);
  
  // Get all players from Firebase
  const playersSnapshot = await db.collection('tagPlayers').get();
  console.log(`[Init Scores] Found ${playersSnapshot.size} players in Firebase`);
  
  // Update scores
  const batch = db.batch();
  let updated = 0;
  
  playersSnapshot.docs.forEach(doc => {
    const score = scoreMap[doc.id] || 0;
    batch.update(doc.ref, { score });
    updated++;
  });
  
  await batch.commit();
  console.log(`[Init Scores] ✅ Updated ${updated} players with scores from streamweaver`);
  
  process.exit(0);
}

initializeScores().catch(err => {
  console.error('[Init Scores] Error:', err);
  process.exit(1);
});
