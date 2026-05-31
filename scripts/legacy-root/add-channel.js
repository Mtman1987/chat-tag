// Quick script to add a channel to botChannels
const fetch = require('node:fetch');

const channel = 'mtman1987';

fetch('http://localhost:9002/api/bot/channels/join', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ channel })
})
.then(res => res.json())
.then(data => console.log('Added:', data))
.catch(err => console.error('Error:', err));
