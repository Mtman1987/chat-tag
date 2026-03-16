/* eslint-disable no-console */
const fsp = require('fs/promises');
const path = require('path');

const ROOT = process.cwd();
const DATA_DIR = process.env.DATA_DIR || process.env.FLY_VOLUME_PATH || path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'app-state.json');

function nowIso() {
  return new Date().toISOString();
}

function defaultState() {
  return {
    users: {},
    tagPlayers: {},
    tagHistory: [],
    tagGame: { state: { currentIt: null, lastTagTime: null } },
    bingoCards: {},
    bingoEvents: [],
    chatTags: [],
    botChannels: {},
    botSettings: {
      mutedChannels: { channels: [] },
      blacklistedChannels: { channels: [] },
    },
    settings: {},
    gameSettings: { default: {} },
    pinTags: { pinscorpion6521: { counts: {} } },
    discordMessages: {},
    botRuntime: {
      joinedChannels: [],
      firstLiveAnnouncementByChannel: {},
    },
  };
}

function deepMerge(target, source) {
  for (const [k, v] of Object.entries(source || {})) {
    if (Array.isArray(v)) {
      target[k] = v;
      continue;
    }
    if (v && typeof v === 'object') {
      target[k] = target[k] && typeof target[k] === 'object' ? target[k] : {};
      deepMerge(target[k], v);
      continue;
    }
    target[k] = v;
  }
  return target;
}

async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeChannel(name) {
  return String(name || '').trim().toLowerCase().replace(/^#/, '');
}

async function importFromLocalFiles(state) {
  const tagStats = await readJson(path.join(ROOT, 'tag-stats.json'));
  if (tagStats) {
    for (const p of tagStats.players || []) {
      const id = p.id || p.userId;
      if (!id) continue;
      state.tagPlayers[id] = {
        ...(state.tagPlayers[id] || {}),
        id,
        twitchUsername: (p.twitchUsername || p.username || id).toLowerCase(),
        avatarUrl: p.avatar || p.avatarUrl || '',
        score: p.score || state.tagPlayers[id]?.score || 0,
        tags: p.tags || state.tagPlayers[id]?.tags || 0,
        tagged: p.tagged || state.tagPlayers[id]?.tagged || 0,
        isIt: tagStats.currentIt === id,
        isActive: p.isActive ?? false,
      };
    }

    state.tagHistory = (tagStats.history || []).map((h) => ({
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      taggerId: h.taggerId || h.from,
      taggedId: h.taggedId || h.to,
      streamerId: String(h.streamerId || h.channel || '').replace(/^#/, ''),
      timestamp: typeof h.timestamp === 'number' ? h.timestamp : Date.now(),
      doublePoints: Boolean(h.doublePoints),
      blocked: h.blocked || null,
    }));

    state.tagGame.state = {
      currentIt: tagStats.currentIt || null,
      lastTagTime: tagStats.lastUpdate || Date.now(),
    };

    const immunity = tagStats.immunity || {};
    for (const [key, value] of Object.entries(immunity)) {
      if (key.endsWith('_offline')) {
        const userId = key.replace(/_offline$/, '');
        if (state.tagPlayers[userId]) state.tagPlayers[userId].offlineImmunity = Boolean(value);
      } else if (key.endsWith('_timed')) {
        const userId = key.replace(/_timed$/, '');
        if (state.tagPlayers[userId] && typeof value === 'number') state.tagPlayers[userId].timedImmunityUntil = value;
      } else if (state.tagPlayers[key] && typeof value === 'string') {
        state.tagPlayers[key].noTagbackFrom = value;
      }
    }
  }

  const muted = await readJson(path.join(ROOT, 'data', 'bot-muted-channels.json'));
  if (Array.isArray(muted)) {
    state.botSettings.mutedChannels.channels = muted.map(normalizeChannel).filter(Boolean);
  }

  const blacklisted = await readJson(path.join(ROOT, 'data', 'bot-channels-blacklist.json'));
  if (Array.isArray(blacklisted)) {
    state.botSettings.blacklistedChannels.channels = blacklisted.map(normalizeChannel).filter(Boolean);
  }

  const discordLast = await readJson(path.join(ROOT, 'data', 'discord-last-tag-message.json'));
  if (discordLast && typeof discordLast === 'object') {
    state.discordMessages.lastTagAnnouncement = { ...discordLast, timestamp: nowIso() };
  }

  for (const player of Object.values(state.tagPlayers)) {
    const channel = normalizeChannel(player.twitchUsername);
    if (!channel) continue;
    state.botChannels[channel] = {
      ...(state.botChannels[channel] || {}),
      name: channel,
      status: state.botChannels[channel]?.status || 'joined',
      lastUpdated: nowIso(),
    };
  }

  console.log('Imported from local files.');
}

async function importFromFirestore(state) {
  const admin = require('firebase-admin');

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY');
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
  }

  const db = admin.firestore();

  const mapCollectionToRecord = async (collection, target) => {
    const snap = await db.collection(collection).get();
    for (const doc of snap.docs) target[doc.id] = doc.data();
    return snap.size;
  };

  const mapCollectionToArray = async (collection, target) => {
    const snap = await db.collection(collection).get();
    for (const doc of snap.docs) target.push({ id: doc.id, ...doc.data() });
    return snap.size;
  };

  await mapCollectionToRecord('users', state.users);
  await mapCollectionToRecord('tagPlayers', state.tagPlayers);
  await mapCollectionToArray('tagHistory', state.tagHistory);
  await mapCollectionToArray('chatTags', state.chatTags);
  await mapCollectionToArray('bingoEvents', state.bingoEvents);
  await mapCollectionToRecord('botChannels', state.botChannels);

  const gameDoc = await db.collection('tagGame').doc('state').get();
  if (gameDoc.exists) state.tagGame.state = { ...state.tagGame.state, ...gameDoc.data() };

  const bingoCardDoc = await db.collection('bingoCards').doc('current_user').get();
  if (bingoCardDoc.exists) state.bingoCards.current_user = bingoCardDoc.data();

  const mutedDoc = await db.collection('botSettings').doc('mutedChannels').get();
  if (mutedDoc.exists) state.botSettings.mutedChannels = mutedDoc.data();

  const commandsDoc = await db.collection('settings').doc('botCommands').get();
  if (commandsDoc.exists) state.settings.botCommands = commandsDoc.data();

  const settingsDoc = await db.collection('gameSettings').doc('default').get();
  if (settingsDoc.exists) state.gameSettings.default = settingsDoc.data();

  const pinDoc = await db.collection('pinTags').doc('pinscorpion6521').get();
  if (pinDoc.exists) state.pinTags.pinscorpion6521 = pinDoc.data();

  const discordDoc = await db.collection('discordMessages').doc('lastTagAnnouncement').get();
  if (discordDoc.exists) state.discordMessages.lastTagAnnouncement = discordDoc.data();

  console.log('Imported from Firestore.');
}

async function main() {
  const fromFirestore = process.argv.includes('--from-firestore');
  const fromFiles = !process.argv.includes('--skip-files');

  await fsp.mkdir(DATA_DIR, { recursive: true });

  const existing = (await readJson(STATE_FILE)) || defaultState();
  const state = deepMerge(defaultState(), existing);

  if (fromFiles) await importFromLocalFiles(state);
  if (fromFirestore) await importFromFirestore(state);

  await fsp.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  console.log(`Wrote ${STATE_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
