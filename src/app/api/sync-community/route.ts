
import { NextRequest, NextResponse } from 'next/server';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { AdminPlayer } from '@/lib/types';

// Player object structure expected from external API
type ExternalPlayer = {
  id: string;
  twitchUsername: string;
  avatarUrl: string;
  isActive: boolean;
  score?: number; // Now accepting an optional score/community points field
};

export async function POST(req: NextRequest) {
  const { 
    externalApiUrl,
   } = await req.json();

  if (!externalApiUrl) {
    return NextResponse.json(
        { error: 'External API URL is not configured. Community sync cannot proceed.' },
        { status: 400 }
    );
  }
  
  try {
    console.log(`Attempting to sync from external API: ${externalApiUrl}`);
    const externalApiResponse = await fetch(externalApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({}),
      cache: 'no-store',
    });

    if (!externalApiResponse.ok) {
      throw new Error(`External API returned status: ${externalApiResponse.status} ${externalApiResponse.statusText}`);
    }

    const data = await externalApiResponse.json();
    if (!data.players) {
      throw new Error('Invalid data format from external API. Expected a "players" array.');
    }
    
    const playersToUpdate: ExternalPlayer[] = data.players;

    // --- Firestore Batch Update Logic ---
    const adminApp = initializeAdminApp();
    const db = getFirestore(adminApp);
    const batch = db.batch();
    const usersCollection = db.collection('users');
    const allCurrentPlayersSnap = await usersCollection.get();
    
    const existingPlayerIds = new Set<string>();
    allCurrentPlayersSnap.forEach(doc => {
      existingPlayerIds.add(doc.id);
    });

    const activePlayerIdsFromSync = new Set(playersToUpdate.map(p => p.id));

    // Deactivate players who are no longer in the active list from the sync
    allCurrentPlayersSnap.docs.forEach(docSnap => {
        const player = docSnap.data() as AdminPlayer;
        // Only deactivate if they were previously considered active by the sync
        if (player.isActive && !activePlayerIdsFromSync.has(player.id)) {
            batch.update(docSnap.ref, { isActive: false });
        }
    });

    playersToUpdate.forEach(player => {
      const userRef = usersCollection.doc(player.id);
      
      const playerData: Partial<AdminPlayer> = {
          id: player.id,
          twitchUsername: player.twitchUsername,
          avatarUrl: player.avatarUrl,
          isActive: player.isActive,
          communityPoints: player.score ?? 0 // Use the provided score, or default to 0
      };

      if (existingPlayerIds.has(player.id)) {
          // Player exists, update their data
          batch.update(userRef, playerData);
      } else {
          // New player, set their initial data, including a default game score
          const newPlayer: AdminPlayer = {
              ...playerData,
              score: 0, // This is the in-app game score
              isIt: false,
          } as AdminPlayer;
          batch.set(userRef, newPlayer);
      }
    });
    
    await batch.commit();
    // --- End Firestore Logic ---

    console.log(`Successfully synced ${playersToUpdate.length} players from external API.`);
    return NextResponse.json({ 
        players: playersToUpdate, 
        syncedFrom: 'external',
        message: `Successfully synchronized ${playersToUpdate.length} players.` 
    });

  } catch (error: any) {
    console.error('Fatal Error: Community sync failed.', error);
    return NextResponse.json(
      { error: `Community sync failed. Last error: ${error.message}` },
      { status: 500 }
    );
  }
}
