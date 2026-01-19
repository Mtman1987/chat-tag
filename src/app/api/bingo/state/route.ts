import { NextRequest, NextResponse } from 'next/server';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

export async function GET(req: NextRequest) {
  try {
    const adminApp = initializeAdminApp();
    const db = getFirestore(adminApp);
    
    const settingsDoc = await db.collection('gameSettings').doc('default').get();
    const settings = settingsDoc.data() || {};
    
    const usersSnap = await db.collection('users').get();
    const players = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const currentIt = players.find(p => p.isIt);
    const immunity: Record<string, any> = {};
    
    players.forEach(p => {
      // Permanent immunity (no tagbacks)
      if (p.immuneToUserId) {
        immunity[p.id] = p.immuneToUserId;
      }
      // Timed immunity (20 min)
      if (p.timedImmunityUntil && p.timedImmunityUntil.toDate() > new Date()) {
        immunity[`${p.id}_timed`] = p.timedImmunityUntil.toMillis();
      }
      // Sleeping immunity (permanent until removed)
      if (p.tagImmunityUntil && p.tagImmunityUntil.toDate() > new Date()) {
        immunity[p.id] = 'sleeping';
      }
    });
    
    const tagsSnap = await db.collection('chatTags').orderBy('timestamp', 'desc').limit(100).get();
    const tags = tagsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    return NextResponse.json({
      tag: {
        players,
        currentIt: currentIt?.id || null,
        immunity,
        tags
      },
      bingo: settings
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, userId, targetUserId, streamerChannel } = await req.json();
    
    const adminApp = initializeAdminApp();
    const db = getFirestore(adminApp);
    
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
        return NextResponse.json({ error: 'MTMAN IS SLEEPING' }, { status: 400 });
      }
      
      if (target?.immuneToUserId === userId) {
        return NextResponse.json({ error: 'Target is immune to your tags!' }, { status: 400 });
      }
      
      if (target?.timedImmunityUntil && target.timedImmunityUntil.toDate() > new Date()) {
        const remainingMins = Math.ceil((target.timedImmunityUntil.toDate().getTime() - Date.now()) / 60000);
        return NextResponse.json({ error: `Target is immune for ${remainingMins} more minutes!` }, { status: 400 });
      }
      
      const isFreeForAll = !tagger.isIt;
      
      await db.collection('chatTags').add({
        taggerId: userId,
        taggedId: targetUserId,
        streamerId: streamerChannel,
        doublePoints: isFreeForAll,
        timestamp: FieldValue.serverTimestamp()
      });
      
      const batch = db.batch();
      const timedImmunityExpires = Timestamp.fromMillis(Date.now() + 20 * 60 * 1000);
      
      batch.update(taggerDoc.ref, {
        isIt: false,
        timedImmunityUntil: timedImmunityExpires,
        immuneToUserId: null
      });
      
      batch.update(targetDoc.ref, {
        isIt: true,
        immuneToUserId: userId
      });
      
      await batch.commit();
      
      return NextResponse.json({ success: true, doublePoints: isFreeForAll });
    }
    
    if (action === 'set-it') {
      const batch = db.batch();
      const allUsers = await db.collection('users').get();
      
      allUsers.docs.forEach(doc => {
        batch.update(doc.ref, { isIt: doc.id === userId });
      });
      
      await batch.commit();
      return NextResponse.json({ success: true });
    }
    
    if (action === 'set-immunity') {
      const userRef = db.collection('users').doc(userId);
      const immunityExpires = Timestamp.fromMillis(Date.now() + 365 * 24 * 60 * 60 * 1000);
      
      await userRef.update({ tagImmunityUntil: immunityExpires });
      
      return NextResponse.json({ success: true });
    }
    
    if (action === 'remove-immunity') {
      const userRef = db.collection('users').doc(userId);
      await userRef.update({ tagImmunityUntil: null });
      
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
