const tmi = require('tmi.js');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=:#]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
});

const username = env.TWITCH_BOT_USERNAME;
const token = env.TWITCH_BOT_TOKEN;

console.log('[Bot] Username:', username);
console.log('[Bot] Token:', token.substring(0, 10) + '...');

const client = new tmi.Client({
  options: { debug: true },
  identity: {
    username: username,
    password: `oauth:${token}`
  },
  channels: [username]
});

client.on('connected', () => {
  console.log('[Bot] ✅ Connected successfully!');
});

client.on('message', (channel, tags, message, self) => {
  if (self) return;
  
  const msg = message.toLowerCase().trim();
  if (!msg.startsWith('@spmt ')) return;
  
  const args = msg.split(/\s+/).slice(1);
  const command = args[0];
  const user = tags['display-name'] || tags['username'];
  
  console.log(`[Bot] Command from ${user}: ${command}`);
  
  if (command === 'test') {
    client.say(channel, `@${user} Bot is working!`);
  }
});

client.connect().catch(err => {
  console.error('[Bot] Connection error:', err);
  process.exit(1);
});
