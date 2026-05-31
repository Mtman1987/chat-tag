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

console.log('Username:', username);
console.log('Token:', token);
console.log('Token length:', token.length);

const client = new tmi.Client({
  options: { debug: true },
  identity: {
    username: username,
    password: `oauth:${token}`
  },
  channels: [username]
});

client.on('connected', () => {
  console.log('✅ Connected successfully!');
  process.exit(0);
});

client.on('disconnected', (reason) => {
  console.log('❌ Disconnected:', reason);
  process.exit(1);
});

client.connect().catch(err => {
  console.error('❌ Connection error:', err);
  process.exit(1);
});
