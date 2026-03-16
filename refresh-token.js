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

async function refreshToken() {
  const clientId = env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
  const clientSecret = env.TWITCH_CLIENT_SECRET;
  const refreshToken = env.TWITCH_BOT_REFRESH_TOKEN;
  
  console.log('Refreshing bot token...');
  
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });
  
  if (!response.ok) {
    console.error('Failed to refresh token:', await response.text());
    process.exit(1);
  }
  
  const data = await response.json();
  console.log('✅ Token refreshed successfully!');
  console.log('New access token:', data.access_token);
  console.log('New refresh token:', data.refresh_token);
  
  // Update .env.local
  let newEnvContent = envContent;
  newEnvContent = newEnvContent.replace(/TWITCH_BOT_TOKEN=.+/, `TWITCH_BOT_TOKEN=${data.access_token}`);
  newEnvContent = newEnvContent.replace(/TWITCH_BOT_REFRESH_TOKEN=.+/, `TWITCH_BOT_REFRESH_TOKEN=${data.refresh_token}`);
  
  fs.writeFileSync(envPath, newEnvContent);
  console.log('✅ Updated .env.local with new tokens');
}

refreshToken().catch(console.error);
