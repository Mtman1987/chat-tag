require('dotenv').config({ path: '.env.local' });
const http = require('http');

const CLIENT_ID = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3100/auth/twitch/callback';
const SCOPES = 'user:write:chat user:bot chat:read chat:edit';

const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPES)}`;

console.log('\n=== Bot Reauthorization ===\n');
console.log('1. Open this URL in your browser (logged in as the BOT account):');
console.log('\n' + authUrl + '\n');
console.log('2. Authorize the app');
console.log('3. You will be redirected to localhost:3000/auth/callback?code=...');
console.log('4. Copy the code from the URL and paste it here\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  if (url.pathname === '/auth/twitch/callback') {
    const code = url.searchParams.get('code');
    
    if (!code) {
      res.writeHead(400);
      res.end('No code provided');
      return;
    }

    try {
      // Exchange code for token
      const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: REDIRECT_URI
        })
      });

      const data = await tokenRes.json();

      if (data.access_token) {
        console.log('\n✅ Success! New tokens:\n');
        console.log('TWITCH_BOT_TOKEN=' + data.access_token);
        console.log('TWITCH_BOT_REFRESH_TOKEN=' + data.refresh_token);
        console.log('\nRun these commands to update Fly.io secrets:\n');
        console.log(`fly secrets set TWITCH_BOT_TOKEN="${data.access_token}" -a chat-tag-bot`);
        console.log(`fly secrets set TWITCH_BOT_REFRESH_TOKEN="${data.refresh_token}" -a chat-tag-bot`);
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Success!</h1><p>Check your terminal for the new tokens.</p>');
        
        setTimeout(() => {
          server.close();
          process.exit(0);
        }, 1000);
      } else {
        throw new Error(JSON.stringify(data));
      }
    } catch (e) {
      console.error('Error:', e.message);
      res.writeHead(500);
      res.end('Error: ' + e.message);
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(3100, () => {
  console.log('Waiting for authorization...\n');
});
