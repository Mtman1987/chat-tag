const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = 8091;

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/broadcast') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { message, channel } = JSON.parse(body);
        console.log(`[HTTP Broadcast] ${channel ? `To ${channel}` : 'To all'}: ${message}`);
        broadcast({ type: channel ? 'single' : 'all', message, channel });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});
const wss = new WebSocketServer({ server });

const clients = new Set();

wss.on('connection', (ws) => {
  console.log('[WebSocket] Client connected');
  clients.add(ws);

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'test-single') {
        console.log(`[Broadcast] Test message to ${message.channel}: ${message.message}`);
      } else if (message.type === 'tag-announcement') {
        console.log(`[Broadcast] Tag announcement: ${message.message}`);
        broadcast({ type: 'tag-update', message: message.message });
      } else if (message.type === 'all') {
        console.log(`[Broadcast] All channels: ${message.message}`);
        broadcast({ type: 'broadcast', message: message.message });
      }
    } catch (e) {
      console.error('[WebSocket] Error:', e);
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
    clients.delete(ws);
  });
});

function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
  console.log(`[WebSocket] Broadcasted to ${clients.size} clients`);
}

server.listen(PORT, () => {
  console.log(`[WebSocket] Server running on port ${PORT}`);
});
