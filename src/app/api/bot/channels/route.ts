import { NextRequest, NextResponse } from 'next/server';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

export async function GET(req: NextRequest) {
  try {
    const adminApp = initializeAdminApp();
    const db = getFirestore(adminApp);
    
    const usersSnap = await db.collection('users').get();
    const channels = usersSnap.docs.map(doc => ({
      id: doc.id,
      username: doc.data().twitchUsername,
      isActive: doc.data().isActive || false
    }));
    
    return NextResponse.json({ channels });
  } catch (error: any) {
    console.error('Bot channels API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
