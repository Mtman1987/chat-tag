/**
 * One-time cleanup: prune botChannels entries that have no matching tagPlayer.
 * 
 * Run with: node scripts/prune-orphaned-channels.js
 * 
 * Safe to run multiple times — only deletes orphans, never touches tagPlayers.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || process.env.FLY_VOLUME_PATH || path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'app-state.json');

function run() {
  if (!fs.existsSync(STATE_FILE)) {
    console.log('No app-state.json found at', STATE_FILE);
    process.exit(1);
  }

  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

  // Build set of usernames from tagPlayers
  const playerUsernames = new Set();
  for (const player of Object.values(state.tagPlayers || {})) {
    const username = (player.twitchUsername || '').toLowerCase();
    if (username) playerUsernames.add(username);
  }

  const before = Object.keys(state.botChannels || {}).length;
  let pruned = 0;

  for (const channelName of Object.keys(state.botChannels || {})) {
    if (!playerUsernames.has(channelName.toLowerCase())) {
      delete state.botChannels[channelName];
      pruned++;
    }
  }

  const after = Object.keys(state.botChannels || {}).length;

  if (pruned > 0) {
    // Backup first
    const backupPath = STATE_FILE + '.backup-' + Date.now();
    fs.copyFileSync(STATE_FILE, backupPath);
    console.log(`Backup saved to ${backupPath}`);

    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    console.log(`Pruned ${pruned} orphaned botChannels (${before} -> ${after})`);
    console.log(`Remaining: ${after} channels matching ${playerUsernames.size} players`);
  } else {
    console.log(`No orphans found. ${before} channels, ${playerUsernames.size} players — already in sync.`);
  }
}

run();
