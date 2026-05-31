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

async function validateToken() {
  const token = env.TWITCH_BOT_TOKEN;
  
  console.log('Validating token:', token.substring(0, 10) + '...');
  
  const response = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: {
      'Authorization': `OAuth ${token}`
    }
  });
  
  if (!response.ok) {
    console.error('❌ Token is invalid:', response.status);
    console.log('Response:', await response.text());
    return false;
  }
  
  const data = await response.json();
  console.log('✅ Token is valid!');
  console.log('User ID:', data.user_id);
  console.log('Login:', data.login);
  console.log('Scopes:', data.scopes);
  console.log('Expires in:', data.expires_in, 'seconds');
  return true;
}

validateToken().catch(console.error);
