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

async function migrate() {
  console.log('[Migrate] Starting data migration...');
  
  const dataPath = 'c:\\Users\\mtman\\Desktop\\Enviroment\\streamweaver-v2-main\\data';
  
  // Load tag-stats.json
  const tagStats = JSON.parse(fs.readFileSync(path.join(dataPath, 'tag-stats.json'), 'utf8'));
  console.log(`[Migrate] Found ${tagStats.players.length} players, ${tagStats.tags.length} tags`);
  
  // Migrate players to users collection
  for (const player of tagStats.players) {
    await db.collection('users').doc(player.id).set({
      twitchUsername: player.username,
      avatarUrl: player.avatar || `https://ui-avatars.com/api/?name=${player.username}`,
      isActive: false
    });
  }
  console.log(`[Migrate] ✅ Migrated ${tagStats.players.length} players`);
  
  // Migrate tag game state
  await db.collection('gameState').doc('tag').set({
    currentIt: tagStats.currentIt,
    immunity: tagStats.immunity || {},
    tags: tagStats.tags,
    lastUpdate: tagStats.lastUpdate || Date.now()
  });
  console.log(`[Migrate] ✅ Migrated tag game state`);
  
  // Load all settings files
  const spanishChannels = fs.existsSync(path.join(dataPath, 'bot-spanish-channels.json')) 
    ? JSON.parse(fs.readFileSync(path.join(dataPath, 'bot-spanish-channels.json'), 'utf8')) : [];
  const frenchChannels = fs.existsSync(path.join(dataPath, 'bot-french-channels.json'))
    ? JSON.parse(fs.readFileSync(path.join(dataPath, 'bot-french-channels.json'), 'utf8')) : [];
  const mutedChannels = fs.existsSync(path.join(dataPath, 'bot-muted-channels.json'))
    ? JSON.parse(fs.readFileSync(path.join(dataPath, 'bot-muted-channels.json'), 'utf8')) : [];
  const blacklistedChannels = fs.existsSync(path.join(dataPath, 'bot-channels-blacklist.json'))
    ? JSON.parse(fs.readFileSync(path.join(dataPath, 'bot-channels-blacklist.json'), 'utf8')) : [];
  
  await db.collection('settings').doc('bot').set({
    spanishChannels,
    frenchChannels,
    mutedChannels,
    blacklistedChannels
  });
  console.log(`[Migrate] ✅ Migrated settings (${spanishChannels.length} Spanish, ${frenchChannels.length} French, ${mutedChannels.length} muted, ${blacklistedChannels.length} blacklisted)`);
  
  // Create gameSettings document
  await db.collection('gameSettings').doc('default').set({
    bingoEnabled: true,
    chatTagEnabled: true,
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || ''
  });
  console.log(`[Migrate] ✅ Created gameSettings`);
  
  // Migrate bingo game state
  const bingoCards = fs.existsSync(path.join(dataPath, 'bingo-cards.json'))
    ? JSON.parse(fs.readFileSync(path.join(dataPath, 'bingo-cards.json'), 'utf8')) : {};
  
  if (bingoCards.current_user) {
    await db.collection('gameState').doc('bingo').set({
      phrases: bingoCards.current_user.phrases,
      covered: bingoCards.current_user.covered,
      updatedAt: bingoCards.current_user.updatedAt || new Date().toISOString()
    });
    console.log(`[Migrate] ✅ Migrated bingo game state`);
  }
  
  console.log('[Migrate] 🎉 Migration complete!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('[Migrate] Error:', err);
  process.exit(1);
});
