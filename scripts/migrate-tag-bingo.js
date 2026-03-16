const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load env manually
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
});

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  })
});

const db = admin.firestore();

async function migrateTagAndBingo() {
  try {
    // Migrate tag-stats.json
    const tagStatsPath = path.join(__dirname, '../../streamweaver-v2-main/data/tag-stats.json');
    const tagStats = JSON.parse(fs.readFileSync(tagStatsPath, 'utf8'));
    
    console.log(`Migrating ${tagStats.players.length} tag players...`);
    
    // Store tag game state
    await db.collection('tagGame').doc('state').set({
      currentIt: tagStats.currentIt,
      immunity: tagStats.immunity,
      lastUpdate: tagStats.lastUpdate
    });
    
    // Store tag players
    let batch = db.batch();
    let count = 0;
    for (const player of tagStats.players) {
      const docRef = db.collection('tagPlayers').doc(player.id);
      batch.set(docRef, player);
      count++;
      if (count % 500 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    await batch.commit();
    console.log(`✓ Migrated ${count} tag players`);
    
    // Store tag history
    batch = db.batch();
    count = 0;
    for (const tag of tagStats.tags) {
      const docRef = db.collection('tagHistory').doc();
      batch.set(docRef, tag);
      count++;
      if (count % 500 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    await batch.commit();
    console.log(`✓ Migrated ${count} tag history entries`);
    
    // Migrate bingo-cards.json
    const bingoPath = path.join(__dirname, '../../streamweaver-v2-main/data/bingo-cards.json');
    const bingoData = JSON.parse(fs.readFileSync(bingoPath, 'utf8'));
    
    await db.collection('bingoCards').doc('current_user').set(bingoData.current_user);
    console.log(`✓ Migrated bingo card`);
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit();
  }
}

migrateTagAndBingo();
