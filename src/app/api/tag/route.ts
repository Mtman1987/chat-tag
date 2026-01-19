import { NextRequest, NextResponse } from 'next/server';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
  try {
    const { action, userId, username, avatar, targetUserId, streamerId } = await req.json();
    
    const adminApp = initializeAdminApp();
    const db = getFirestore(adminApp);
    
    if (action === 'join') {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (userDoc.exists) {
        return NextResponse.json({ error: 'Already in game' }, { status: 400 });
      }
      
      const allUsers = await db.collection('users').get();
      const isAnyoneIt = allUsers.docs.some(doc => doc.data().isIt);
      
      await userRef.set({
        id: userId,
        twitchUsername: username,
        avatarUrl: avatar,
        score: 0,
        isIt: !isAnyoneIt,
        isActive: false
      });
      
      return NextResponse.json({ success: true });
    }
    
    if (action === 'leave') {
      const userRef = db.collection('users').doc(userId);
      await userRef.delete();
      return NextResponse.json({ success: true });
    }
    
    if (action === 'tag') {
      const allUsers = await db.collection('users').get();
      const tagger = allUsers.docs.find(d => d.id === userId)?.data();
      const target = allUsers.docs.find(d => d.id === targetUserId)?.data();
      
      if (!tagger?.isIt) {
        return NextResponse.json({ error: 'You are not it!' }, { status: 400 });
      }
      
      const batch = db.batch();
      
      allUsers.docs.forEach(doc => {
        if (doc.id === userId) {
          batch.update(doc.ref, { isIt: false });
        } else if (doc.id === targetUserId) {
          batch.update(doc.ref, { isIt: true });
        }
      });
      
      await batch.commit();
      
      await db.collection('chatTags').add({
        taggerId: userId,
        taggedId: targetUserId,
        streamerId: streamerId,
        timestamp: FieldValue.serverTimestamp()
      });
      
      return NextResponse.json({ success: true });
    }
    
    if (action === 'tag') {
      const usersRef = db.collection('users');
      const taggerDoc = await usersRef.doc(userId).get();
      const targetDoc = await usersRef.doc(targetUserId).get();
      
      if (!taggerDoc.exists || !targetDoc.exists) {
        return NextResponse.json({ error: 'Player not found' }, { status: 404 });
      }
      
      const tagger = taggerDoc.data();
      const target = targetDoc.data();
      
      if (!tagger?.isIt) {
        return NextResponse.json({ error: 'You are not it!' }, { status: 400 });
      }
      
      if (target?.tagImmunityUntil && target.tagImmunityUntil.toDate() > new Date()) {
        return NextResponse.json({ error: 'Target is immune' }, { status: 400 });
      }
      
      await db.collection('chatTags').add({
        taggerId: userId,
        taggedId: targetUserId,
        streamerId: streamerId,
        timestamp: FieldValue.serverTimestamp()
      });
      
      const batch = db.batch();
      const immunityExpires = Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);
      
      batch.update(taggerDoc.ref, {
        score: (tagger.score || 0) + 100,
        isIt: false,
        tagImmunityUntil: immunityExpires,
        lastTaggedInStreamId: null
      });
      
      batch.update(targetDoc.ref, {
        score: (target.score || 0) - 50,
        isIt: true,
        lastTaggedInStreamId: streamerId
      });
      
      await batch.commit();
      
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Tag API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
