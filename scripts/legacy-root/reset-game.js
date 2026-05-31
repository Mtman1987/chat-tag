require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

const serviceAccount = {
  type: 'service_account',
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: process.env.FIREBASE_CERT_URL
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function resetGame() {
  console.log('Resetting game state...');
  
  const playersSnap = await db.collection('tagPlayers').get();
  const batch = db.batch();
  
  playersSnap.docs.forEach(doc => {
    batch.update(doc.ref, {
      isIt: false,
      sleepingImmunity: false,
      offlineImmunity: false,
      noTagbackFrom: null,
      timedImmunityUntil: null
    });
  });
  
  await batch.commit();
  await db.collection('tagGame').doc('state').set({ currentIt: null, lastTagTime: admin.firestore.FieldValue.serverTimestamp() });
  
  console.log(`✅ Reset ${playersSnap.size} players - FREE FOR ALL mode activated`);
  process.exit(0);
}

resetGame().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
