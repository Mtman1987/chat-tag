import admin from 'firebase-admin';

// This function initializes the Firebase Admin SDK.
// It ensures that it's only initialized once.
export function initializeAdminApp() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  // This is a workaround for environments where process.env is not populated at build time.
  // In a typical Vercel/Next.js setup, you'd use environment variables directly.
  const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountString) {
    throw new Error('The FIREBASE_SERVICE_ACCOUNT environment variable is not set.');
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountString);
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch(e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT. Make sure it's a valid JSON string.", e);
    throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT format.");
  }
}
