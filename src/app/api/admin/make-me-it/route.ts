import { NextRequest, NextResponse } from 'next/server';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  try {
    const adminApp = initializeAdminApp();
    const db = getFirestore(adminApp);
    
    const usersSnap = await db.collection('users').get();
    const mtman = usersSnap.docs.find(doc => doc.data().twitchUsername?.toLowerCase() === 'mtman1987');
    
    if (!mtman) {
      return NextResponse.json({ error: 'mtman1987 not found' }, { status: 404 });
    }
    
    const batch = db.batch();
    usersSnap.docs.forEach(doc => {
      batch.update(doc.ref, { 
        isIt: doc.id === mtman.id,
        immuneToUserId: null
      });
    });
    
    await batch.commit();
    
    return NextResponse.json({ success: true, message: 'mtman1987 is now it!' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const adminApp = initializeAdminApp();
    const db = getFirestore(adminApp);
    
    const usersSnap = await db.collection('users').get();
    const currentIt = usersSnap.docs.find(doc => doc.data().isIt);
    
    const batch = db.batch();
    usersSnap.docs.forEach(doc => {
      batch.update(doc.ref, { 
        isIt: false,
        immuneToUserId: null,
        timedImmunityUntil: null
      });
    });
    
    await batch.commit();
    
    await db.collection('chatTags').add({
      taggerId: 'system',
      taggedId: 'free-for-all',
      streamerId: 'manual-timeout',
      doublePoints: true,
      timestamp: FieldValue.serverTimestamp()
    });
    
    const announcement = `🔥 FREE FOR ALL! ${currentIt?.data().twitchUsername || 'Someone'} timed out. Anyone can tag for DOUBLE POINTS! 🔥`;
    
    return NextResponse.json({ 
      success: true, 
      previousIt: currentIt?.data().twitchUsername,
      announcement 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
