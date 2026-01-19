const tmi = require('tmi.js');
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

const db = admin.firestore();

let botClient = null;
let broadcasterClient = null;
const TAG_COOLDOWN_MS = 10000;
const TAG_IMMUNITY_MS = 20 * 60 * 1000;
let lastTagTime = 0;
let spanishChannels = new Set();
let frenchChannels = new Set();
let mutedChannels = new Set();
let blacklistedChannels = new Set();
let lastDiscordMessageId = null;
let discordWebhookId = null;
let discordWebhookToken = null;

// Translation dictionaries
const translations = {
  'Spanish mode enabled! All bot messages will be in Spanish.': '¡Modo español activado! Todos los mensajes del bot estarán en español.',
  'Spanish mode disabled! All bot messages will be in English.': '¡Modo español desactivado! Todos los mensajes del bot estarán en inglés.',
  'French mode enabled! All bot messages will be in French.': 'Mode français activé! Tous les messages du bot seront en français.',
  'French mode disabled! All bot messages will be in English.': 'Mode français désactivé! Tous les messages du bot seront en anglais.',
  'joined the tag game!': '¡se unió al juego de tag!',
  "You're already in the game!": '¡Ya estás en el juego!',
  'left the tag game!': '¡salió del juego de tag!',
  'tagged': 'etiquetó a',
  'is now it!': '¡ahora es el que la lleva!',
  "You're not it!": '¡No eres el que la lleva!',
  'is it': 'es el que la lleva',
  'is immune to your tags!': '¡es inmune a tus etiquetas!',
  'No one is it yet!': '¡Nadie es el que la lleva todavía!',
  'Usage: @spmt tag @username': 'Uso: @spmt tag @usuario',
  'is not in the game.': 'no está en el juego.',
  'No players in the game yet!': '¡Todavía no hay jugadores en el juego!',
  'Players': 'Jugadores',
  'No tags yet!': '¡Todavía no hay etiquetas!',
  'Top 3:': 'Top 3:',
  'You have': 'Tienes',
  'points and are in': 'puntos y estás en',
  'place!': 'lugar!',
  'points and been tagged': 'puntos y has sido etiquetado',
  'times.': 'veces.',
  'MTMAN IS SLEEPING - try tagging someone you see in chat': 'MTMAN ESTÁ DURMIENDO - intenta etiquetar a alguien que veas en el chat',
  'Error processing command.': 'Error al procesar comando.'
};

const frenchTranslations = {
  'French mode enabled! All bot messages will be in French.': 'Mode français activé! Tous les messages du bot seront en français.',
  'French mode disabled! All bot messages will be in English.': 'Mode français désactivé! Tous les messages du bot seront en anglais.',
  'joined the tag game!': 'a rejoint le jeu de tag!',
  "You're already in the game!": 'Vous êtes déjà dans le jeu!',
  'left the tag game!': 'a quitté le jeu de tag!',
  'tagged': 'a tagué',
  'is now it!': 'est maintenant le chat!',
  "You're not it!": "Vous n'êtes pas le chat!",
  'is it': 'est le chat',
  'is immune to your tags!': 'est immunisé contre vos tags!',
  'No one is it yet!': "Personne n'est encore le chat!",
  'Usage: @spmt tag @username': 'Utilisation: @spmt tag @utilisateur',
  'is not in the game.': "n'est pas dans le jeu.",
  'No players in the game yet!': 'Aucun joueur dans le jeu pour le moment!',
  'Players': 'Joueurs',
  'No tags yet!': 'Pas encore de tags!',
  'Top 3:': 'Top 3:',
  'You have': 'Vous avez',
  'points and are in': 'points et êtes en',
  'place!': 'place!',
  'points and been tagged': 'points et avez été tagué',
  'times.': 'fois.',
  'MTMAN IS SLEEPING - try tagging someone you see in chat': 'MTMAN DORT - essayez de taguer quelqu\'un que vous voyez dans le chat',
  'Error processing command.': 'Erreur lors du traitement de la commande.'
};

function translate(text, channelName) {
  if (spanishChannels.has(channelName)) {
    for (const [en, es] of Object.entries(translations)) {
      if (text.includes(en)) {
        text = text.replace(en, es);
      }
    }
  } else if (frenchChannels.has(channelName)) {
    for (const [en, fr] of Object.entries(frenchTranslations)) {
      if (text.includes(en)) {
        text = text.replace(en, fr);
      }
    }
  }
  return text;
}

async function loadSettings() {
  try {
    const settingsDoc = await db.collection('settings').doc('bot').get();
    if (settingsDoc.exists) {
      const data = settingsDoc.data();
      spanishChannels = new Set(data.spanishChannels || []);
      frenchChannels = new Set(data.frenchChannels || []);
      mutedChannels = new Set(data.mutedChannels || []);
      blacklistedChannels = new Set(data.blacklistedChannels || []);
      lastDiscordMessageId = data.lastDiscordMessageId || null;
      discordWebhookId = data.discordWebhookId || null;
      discordWebhookToken = data.discordWebhookToken || null;
      console.log(`[Bot] Loaded settings: ${spanishChannels.size} Spanish, ${frenchChannels.size} French, ${mutedChannels.size} muted, ${blacklistedChannels.size} blacklisted`);
    }
  } catch (error) {
    console.error('[Bot] Failed to load settings:', error);
  }
}

async function saveSettings() {
  try {
    await db.collection('settings').doc('bot').set({
      spanishChannels: Array.from(spanishChannels),
      frenchChannels: Array.from(frenchChannels),
      mutedChannels: Array.from(mutedChannels),
      blacklistedChannels: Array.from(blacklistedChannels),
      lastDiscordMessageId,
      discordWebhookId,
      discordWebhookToken
    });
  } catch (error) {
    console.error('[Bot] Failed to save settings:', error);
  }
}

async function getGameState() {
  const stateDoc = await db.collection('gameState').doc('tag').get();
  if (!stateDoc.exists) {
    return { currentIt: null, immunity: {}, tags: [], players: [] };
  }
  
  const state = stateDoc.data();
  const usersSnap = await db.collection('users').get();
  const players = [];
  
  usersSnap.forEach(doc => {
    players.push({ id: doc.id, ...doc.data() });
  });
  
  return {
    currentIt: state.currentIt || null,
    immunity: state.immunity || {},
    tags: state.tags || [],
    players
  };
}

async function syncGameState(updates) {
  await db.collection('gameState').doc('tag').set(updates, { merge: true });
}

async function sendDiscordWebhook(message) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;
  
  try {
    // Delete previous message if exists
    if (lastDiscordMessageId && discordWebhookId && discordWebhookToken) {
      try {
        const deleteUrl = `https://discord.com/api/webhooks/${discordWebhookId}/${discordWebhookToken}/messages/${lastDiscordMessageId}`;
        const deleteResponse = await fetch(deleteUrl, { method: 'DELETE' });
        if (deleteResponse.ok || deleteResponse.status === 404) {
          console.log('[Bot] Deleted previous Discord message');
        }
      } catch (error) {
        console.error('[Bot] Failed to delete previous message:', error);
      }
    }
    
    // Send new message
    const response = await fetch(`${webhookUrl}?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });
    
    if (response.ok) {
      const data = await response.json();
      lastDiscordMessageId = data.id;
      
      // Extract webhook ID and token from URL
      const urlParts = webhookUrl.match(/webhooks\/(\d+)\/([^\/]+)/);
      if (urlParts) {
        discordWebhookId = urlParts[1];
        discordWebhookToken = urlParts[2];
      }
      
      await saveSettings();
      console.log('[Bot] Sent Discord message:', data.id);
    }
  } catch (error) {
    console.error('[Bot] Discord webhook failed:', error);
  }
}

async function broadcastToPlayers(message, excludeChannel = null) {
  const { players } = await getGameState();
  const playerChannels = players.map(p => p.twitchUsername.toLowerCase());
  
  for (const ch of playerChannels) {
    if (ch === excludeChannel || mutedChannels.has(ch)) continue;
    
    try {
      const translatedMsg = translate(message, ch);
      await botClient.say(ch, translatedMsg);
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (error) {
      if (error.message?.includes('followers-only') && broadcasterClient) {
        try {
          await broadcasterClient.say(ch, message);
        } catch {}
      }
    }
  }
}

async function checkFreeForAll() {
  const { currentIt, tags, players } = await getGameState();
  
  if (!currentIt || tags.length === 0) return;
  
  const lastTag = tags[tags.length - 1];
  if (!lastTag || !lastTag.timestamp) return;
  
  const fortyMinsAgo = Date.now() - (40 * 60 * 1000);
  
  if (lastTag.timestamp < fortyMinsAgo) {
    console.log('[Bot] Activating FREE FOR ALL mode...');
    
    const oldIt = players.find(p => p.id === currentIt);
    
    await syncGameState({
      currentIt: null,
      immunity: {},
      tags: admin.firestore.FieldValue.arrayUnion({
        from: 'system',
        to: 'free-for-all',
        timestamp: Date.now(),
        channel: 'auto-timeout'
      })
    });
    
    const broadcastMsg = `🔥 FREE FOR ALL! ${oldIt?.twitchUsername || 'Someone'} timed out. Anyone can tag for DOUBLE POINTS! 🔥`;
    
    sendDiscordWebhook(broadcastMsg).catch(err => console.error('[Bot] Discord webhook failed:', err));
    await broadcastToPlayers(broadcastMsg);
    
    console.log('[Bot] FREE FOR ALL mode activated');
  }
}

async function startBot() {
  await loadSettings();
  
  const botUsername = process.env.TWITCH_BOT_USERNAME;
  const botToken = process.env.TWITCH_BOT_TOKEN;
  const broadcasterUsername = process.env.TWITCH_BROADCASTER_USERNAME;
  const broadcasterToken = process.env.TWITCH_BROADCASTER_TOKEN;
  
  if (!botUsername || !botToken) {
    console.error('[Bot] Missing TWITCH_BOT_USERNAME or TWITCH_BOT_TOKEN');
    process.exit(1);
  }
  
  const { players } = await getGameState();
  const channels = players.map(p => p.twitchUsername.toLowerCase()).filter(ch => !blacklistedChannels.has(ch));
  
  botClient = new tmi.Client({
    options: { debug: false },
    identity: {
      username: botUsername,
      password: `oauth:${botToken.replace(/^oauth:/, '')}`
    },
    channels: channels
  });
  
  if (broadcasterUsername && broadcasterToken) {
    broadcasterClient = new tmi.Client({
      options: { debug: false },
      identity: {
        username: broadcasterUsername,
        password: `oauth:${broadcasterToken.replace(/^oauth:/, '')}`
      },
      channels: channels
    });
    await broadcasterClient.connect();
    console.log('[Bot] Broadcaster fallback client connected');
  }
  
  botClient.on('notice', (channel, msgid, message) => {
    if (msgid === 'msg_banned') {
      const channelName = channel.replace('#', '').toLowerCase();
      console.log(`[Bot] Banned from ${channelName}, adding to blacklist`);
      blacklistedChannels.add(channelName);
      saveSettings();
    }
  });
  
  botClient.on('message', async (channel, tags, message, self) => {
    if (self) return;
    
    const msg = message.toLowerCase().trim();
    if (!msg.startsWith('@spmt ')) return;
    
    const args = msg.split(/\s+/).slice(1);
    const command = args[0];
    const username = tags['display-name'] || tags['username'];
    const userId = tags['user-id'];
    const channelName = channel.replace('#', '').toLowerCase();
    
    const commandAliases = {
      'unirse': 'join', 'salir': 'leave', 'etiquetar': 'tag', 'estado': 'status',
      'jugadores': 'players', 'vivo': 'live', 'puntuacion': 'score', 'rango': 'rank',
      'estadisticas': 'stats', 'reglas': 'rules', 'ayuda': 'help', 'silenciar': 'mute',
      'desilenciar': 'unmute', 'excluir': 'optout', 'rejoindre': 'join', 'partir': 'leave',
      'taguer': 'tag', 'statut': 'status', 'joueurs': 'players', 'envivo': 'live',
      'rang': 'rank', 'statistiques': 'stats', 'règles': 'rules', 'aide': 'help',
      'muet': 'mute', 'activer': 'unmute', 'exclure': 'optout'
    };
    
    const actualCommand = commandAliases[command] || command;
    
    const sendMessage = async (msg) => {
      const translatedMsg = translate(msg, channelName);
      try {
        await botClient.say(channel, translatedMsg);
      } catch (error) {
        if (error.message?.includes('followers-only') && broadcasterClient) {
          try {
            await broadcasterClient.say(channel, msg);
          } catch {}
        }
      }
    };
    
    try {
      switch (actualCommand) {
        case 'join':
          const targetToAdd = args[1]?.replace('@', '').toLowerCase();
          const isAdmin = username.toLowerCase() === 'mtman1987';
          
          if (targetToAdd && isAdmin) {
            const { players } = await getGameState();
            const alreadyInGame = players.find(p => p.twitchUsername.toLowerCase() === targetToAdd);
            
            if (alreadyInGame) {
              await sendMessage(`@${username} ${targetToAdd} is already in the game!`);
              break;
            }
            
            await db.collection('users').doc(`user_${Date.now()}`).set({
              twitchUsername: targetToAdd,
              avatarUrl: `https://ui-avatars.com/api/?name=${targetToAdd}`,
              isActive: true
            });
            
            await sendMessage(`@${username} added ${targetToAdd} to the tag game!`);
            break;
          }
          
          const { players } = await getGameState();
          const alreadyInGame = players.find(p => p.id === userId);
          
          if (alreadyInGame) {
            await sendMessage(`@${username} You're already in the game!`);
            break;
          }
          
          blacklistedChannels.delete(channelName);
          await saveSettings();
          
          await db.collection('users').doc(userId).set({
            twitchUsername: username,
            avatarUrl: tags['user-avatar'] || `https://ui-avatars.com/api/?name=${username}`,
            isActive: true
          });
          
          await sendMessage(`@${username} joined the tag game!`);
          
          const discordInvite = process.env.DISCORD_INVITE_LINK || 'https://discord.gg/your-invite';
          try {
            await botClient.whisper(username, `Thanks for joining! Join our Discord: ${discordInvite}`);
          } catch {}
          break;
          
        case 'leave':
          await db.collection('users').doc(userId).delete();
          await sendMessage(`@${username} left the tag game!`);
          break;
          
        case 'optout':
          await db.collection('users').doc(userId).delete();
          blacklistedChannels.add(channelName);
          await saveSettings();
          await sendMessage(`@${username} You've been removed from the tag game and blacklisted.`);
          break;
          
        case 'mute':
          mutedChannels.add(channelName);
          await saveSettings();
          await sendMessage(`@${username} Bot muted in your channel. Use @spmt unmute to reverse.`);
          break;
          
        case 'unmute':
          mutedChannels.delete(channelName);
          await saveSettings();
          await sendMessage(`@${username} Bot unmuted in your channel.`);
          break;
          
        case 'tag':
          const targetUsername = args[1]?.replace('@', '').toLowerCase();
          if (!targetUsername) {
            await sendMessage(`@${username} Usage: @spmt tag @username`);
            break;
          }
          
          const now = Date.now();
          if (now - lastTagTime < TAG_COOLDOWN_MS) {
            const remainingSeconds = Math.ceil((TAG_COOLDOWN_MS - (now - lastTagTime)) / 1000);
            await sendMessage(`@${username} Please wait ${remainingSeconds} more seconds.`);
            break;
          }
          
          const gameState = await getGameState();
          const targetPlayer = gameState.players.find(p => p.twitchUsername.toLowerCase() === targetUsername);
          
          if (!targetPlayer) {
            await sendMessage(`@${username} ${targetUsername} is not in the game.`);
            break;
          }
          
          if (gameState.immunity[targetPlayer.id] === 'sleeping') {
            await sendMessage(`@${username} MTMAN IS SLEEPING - try tagging someone you see in chat`);
            break;
          }
          
          const isFreeForAll = gameState.currentIt === null;
          const currentUserPlayer = gameState.players.find(p => p.twitchUsername.toLowerCase() === username.toLowerCase());
          
          if (!isFreeForAll) {
            if (!currentUserPlayer || gameState.currentIt !== currentUserPlayer.id) {
              const currentItPlayer = gameState.players.find(p => p.id === gameState.currentIt);
              await sendMessage(`@${username} You're not it! @${currentItPlayer?.twitchUsername || 'someone'} is it.`);
              break;
            }
          }
          
          const taggerUserId = currentUserPlayer?.id || userId;
          if (gameState.immunity[targetPlayer.id] === taggerUserId) {
            await sendMessage(`@${username} ${targetUsername} is immune to your tags!`);
            break;
          }
          
          const timedImmunity = gameState.immunity[`${targetPlayer.id}_timed`];
          if (typeof timedImmunity === 'number' && timedImmunity > Date.now()) {
            const remainingMins = Math.ceil((timedImmunity - Date.now()) / 60000);
            await sendMessage(`@${username} ${targetUsername} is immune for ${remainingMins} more minutes!`);
            break;
          }
          
          lastTagTime = now;
          
          const tagEntry = {
            from: taggerUserId,
            to: targetPlayer.id,
            timestamp: Date.now(),
            channel: channelName
          };
          
          if (isFreeForAll) {
            tagEntry.doublePoints = true;
          }
          
          await syncGameState({
            currentIt: targetPlayer.id,
            immunity: {
              [targetPlayer.id]: taggerUserId,
              [`${taggerUserId}_timed`]: Date.now() + TAG_IMMUNITY_MS
            },
            tags: admin.firestore.FieldValue.arrayUnion(tagEntry)
          });
          
          const broadcastMsg = isFreeForAll
            ? `🔥 ${username} tagged @${targetUsername} for DOUBLE POINTS! @${targetUsername} is now it (immune to @${username})! 🔥`
            : `🎯 ${username} tagged @${targetUsername}! @${targetUsername} is now it (immune to @${username})!`;
          
          sendDiscordWebhook(broadcastMsg).catch(err => console.error('[Bot] Discord webhook failed:', err));
          await broadcastToPlayers(broadcastMsg, channelName);
          break;
          
        case 'status':
          const statusState = await getGameState();
          if (!statusState.currentIt) {
            await sendMessage(`@${username} 🔥 FREE FOR ALL! Anyone can tag for DOUBLE POINTS! 🔥`);
          } else {
            const itPlayer = statusState.players.find(p => p.id === statusState.currentIt);
            const immuneTo = statusState.immunity[statusState.currentIt];
            const immunePlayer = immuneTo ? statusState.players.find(p => p.id === immuneTo) : null;
            const immuneMsg = immunePlayer ? ` (immune to ${immunePlayer.twitchUsername})` : '';
            await sendMessage(`@${username} ${itPlayer?.twitchUsername || 'Unknown'} is it!${immuneMsg}`);
          }
          break;
          
        case 'players':
          const playersState = await getGameState();
          if (playersState.players.length === 0) {
            await sendMessage(`@${username} No players in the game yet!`);
          } else {
            const playerList = playersState.players.map(p => p.twitchUsername).join(', ');
            await sendMessage(`@${username} Players (${playersState.players.length}): ${playerList}`);
          }
          break;
          
        case 'live':
          const liveState = await getGameState();
          const liveChannels = liveState.players.filter(p => p.isActive).map(p => p.twitchUsername);
          if (liveChannels.length === 0) {
            await sendMessage(`@${username} No players are currently live.`);
          } else {
            await sendMessage(`@${username} Live players (${liveChannels.length}): ${liveChannels.join(', ')}`);
          }
          break;
          
        case 'score':
          const scoreState = await getGameState();
          const scoreCounts = {};
          scoreState.tags.forEach(tag => {
            const tagger = scoreState.players.find(p => p.id === tag.from);
            if (tagger) {
              const points = tag.doublePoints ? 2 : 1;
              scoreCounts[tagger.twitchUsername] = (scoreCounts[tagger.twitchUsername] || 0) + points;
            }
          });
          const scoreSorted = Object.entries(scoreCounts).sort((a, b) => b[1] - a[1]);
          const userPoints = scoreCounts[username] || 0;
          const userRank = scoreSorted.findIndex(([name]) => name.toLowerCase() === username.toLowerCase()) + 1;
          if (userRank === 0) {
            await sendMessage(`@${username} You have 0 points and haven't tagged anyone yet.`);
          } else {
            const suffix = userRank === 1 ? 'st' : userRank === 2 ? 'nd' : userRank === 3 ? 'rd' : 'th';
            await sendMessage(`@${username} You have ${userPoints} points and are in ${userRank}${suffix} place!`);
          }
          break;
          
        case 'rank':
          const rankState = await getGameState();
          const rankCounts = {};
          rankState.tags.forEach(tag => {
            const tagger = rankState.players.find(p => p.id === tag.from);
            if (tagger && tagger.id !== 'user_94371378') {
              const points = tag.doublePoints ? 2 : 1;
              rankCounts[tagger.twitchUsername] = (rankCounts[tagger.twitchUsername] || 0) + points;
            }
          });
          const rankSorted = Object.entries(rankCounts).sort((a, b) => b[1] - a[1]);
          if (rankSorted.length === 0) {
            await sendMessage(`@${username} No tags yet!`);
          } else {
            const top3 = rankSorted.slice(0, 3).map(([name, count], i) => `${i + 1}. ${name} (${count})`);
            await sendMessage(`@${username} Top 3: ${top3.join(' | ')}`);
          }
          break;
          
        case 'stats':
          const statsState = await getGameState();
          let userPoints = 0;
          statsState.tags.forEach(tag => {
            if (tag.from === userId) {
              userPoints += tag.doublePoints ? 2 : 1;
            }
          });
          const userTagged = statsState.tags.filter(t => t.to === userId).length;
          await sendMessage(`@${username} You have ${userPoints} points and been tagged ${userTagged} times.`);
          break;
          
        case 'rules':
          await sendMessage(`@${username} Tag game: Type @spmt join to play. When you're it, tag someone with @spmt tag @user. You can't tag the person who tagged you!`);
          break;
          
        case 'es':
          if (spanishChannels.has(channelName)) {
            spanishChannels.delete(channelName);
            await saveSettings();
            await sendMessage(`@${username} Spanish mode disabled! All bot messages will be in English.`);
          } else {
            spanishChannels.add(channelName);
            frenchChannels.delete(channelName);
            await saveSettings();
            await sendMessage(`@${username} Spanish mode enabled! All bot messages will be in Spanish.`);
          }
          break;
          
        case 'fr':
          if (frenchChannels.has(channelName)) {
            frenchChannels.delete(channelName);
            await saveSettings();
            await sendMessage(`@${username} French mode disabled! All bot messages will be in English.`);
          } else {
            frenchChannels.add(channelName);
            spanishChannels.delete(channelName);
            await saveSettings();
            await sendMessage(`@${username} French mode enabled! All bot messages will be in French.`);
          }
          break;
          
        case 'set':
          const targetToSet = args[1]?.replace('@', '').toLowerCase();
          const isSetAdmin = username.toLowerCase() === 'mtman1987';
          
          if (!isSetAdmin) {
            await sendMessage(`@${username} Only admins can use this command.`);
            break;
          }
          
          if (!targetToSet) {
            await sendMessage(`@${username} Usage: @spmt set @username`);
            break;
          }
          
          const setState = await getGameState();
          const targetToSetPlayer = setState.players.find(p => p.twitchUsername.toLowerCase() === targetToSet);
          
          if (!targetToSetPlayer) {
            await sendMessage(`@${username} ${targetToSet} is not in the game.`);
            break;
          }
          
          const currentItPlayer = setState.players.find(p => p.id === setState.currentIt);
          
          if (!currentItPlayer) {
            await sendMessage(`@${username} No one is currently "it".`);
            break;
          }
          
          const tagEntry = {
            from: currentItPlayer.id,
            to: targetToSetPlayer.id,
            timestamp: Date.now(),
            channel: channelName
          };
          
          await syncGameState({
            currentIt: targetToSetPlayer.id,
            immunity: {
              [targetToSetPlayer.id]: currentItPlayer.id,
              [`${currentItPlayer.id}_timed`]: Date.now() + TAG_IMMUNITY_MS
            },
            tags: admin.firestore.FieldValue.arrayUnion(tagEntry)
          });
          
          const setBroadcastMsg = `🎯 ${currentItPlayer.twitchUsername} tagged @${targetToSet}! @${targetToSet} is now it!`;
          sendDiscordWebhook(setBroadcastMsg).catch(err => console.error('[Bot] Discord webhook failed:', err));
          await broadcastToPlayers(setBroadcastMsg, channelName);
          break;
          
        case 'reset':
          const resetState = await getGameState();
          if (resetState.players.length === 0) {
            await sendMessage(`@${username} No players to reset!`);
            break;
          }
          const randomPlayer = resetState.players[Math.floor(Math.random() * resetState.players.length)];
          await syncGameState({
            currentIt: randomPlayer.id,
            immunity: {}
          });
          await sendMessage(`@${username} Game reset! ${randomPlayer.twitchUsername} is now it!`);
          break;
          
        case 'card':
          await sendMessage(`@${username} Bingo card command - check the dashboard for the full card!`);
          break;
          
        case 'claim':
          const squareNum = parseInt(args[1]);
          if (isNaN(squareNum) || squareNum < 0 || squareNum > 24) {
            await sendMessage(`@${username} Usage: @spmt claim [0-24]`);
            break;
          }
          await sendMessage(`@${username} Claimed square ${squareNum}! Check the dashboard to see the board.`);
          break;
          
        case 'bingo':
          await sendMessage(`@${username} Bingo! Check if you got a line on the dashboard.`);
          break;
          
          const infoMessages = [
            '🚀 Twitch-Wide Tag Game powered by @spmt. No installs. Works in any chat. Join: @spmt join | Tag: @spmt tag @user | Status: @spmt status | Players: @spmt players | Stats: @spmt stats | Help: @spmt help',
            '🔒 Bot only replies to @spmt commands. Never posts links/spam. Tagged elsewhere? Your chat gets 1 message. Check whispers for Discord link!'
          ];
          for (const msg of infoMessages) {
            await sendMessage(msg);
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
          const discordLink = process.env.DISCORD_INVITE_LINK || 'https://discord.gg/your-invite';
          try {
            await botClient.whisper(username, `Discord: ${discordLink}`);
          } catch {}
          break;
          
        case 'help':
          await sendMessage(`@${username} join=enter | leave=exit | tag @user=tag | status=who's it | players=list | live=streaming | score=your points | rank=top 3 | stats=your stats | rules=how to play | info=guide | mute=silence | unmute=enable | optout=remove | es=español | fr=français`);
          break;
          
        default:
          await sendMessage(`@${username} Unknown command. Type @spmt help for commands.`);
      }
    } catch (error) {
      console.error(`[Bot] Error handling command ${actualCommand}:`, error);
      await sendMessage(`@${username} Error processing command.`);
    }
  });
  
  await botClient.connect();
  console.log(`[Bot] Connected as ${botUsername} to ${channels.length} channels`);
  
  // Check for FREE FOR ALL every 10 minutes
  setInterval(checkFreeForAll, 10 * 60 * 1000);
}

startBot().catch(console.error);
