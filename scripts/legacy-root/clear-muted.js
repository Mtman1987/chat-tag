require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();

async function clearMuted() {
  await db.collection('botSettings').doc('mutedChannels').set({ channels: [] });
  console.log('✅ Cleared all muted channels');
  process.exit(0);
}

clearMuted();
