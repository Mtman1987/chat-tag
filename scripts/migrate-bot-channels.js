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

async function migrateBotChannels() {
  try {
    const channelsPath = path.join(__dirname, '../../streamweaver-v2-main/data/bot-channels.json');
    const channelsData = JSON.parse(fs.readFileSync(channelsPath, 'utf8'));
    
    console.log(`Found ${channelsData.channels.length} channels to migrate`);
    
    let batch = db.batch();
    let count = 0;
    
    for (const channel of channelsData.channels) {
      const docRef = db.collection('botChannels').doc(channel.name);
      batch.set(docRef, {
        name: channel.name,
        status: channel.status,
        avatar: channel.avatar,
        lastUpdated: new Date().toISOString()
      });
      count++;
      
      if (count % 500 === 0) {
        await batch.commit();
        batch = db.batch();
        console.log(`Migrated ${count} channels...`);
      }
    }
    
    await batch.commit();
    console.log(`✓ Migrated ${count} channels to botChannels collection`);
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit();
  }
}

migrateBotChannels();
