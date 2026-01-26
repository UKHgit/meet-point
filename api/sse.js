// Note: Vercel doesn't natively support WebSockets in free tier
// This is a fallback implementation using Server-Sent Events (SSE)
// For true WebSocket functionality, you'd need a paid service like Pusher or Ably

// In-memory storage (will reset on each function cold start)
const rooms = new Map();
const connections = new Map();

// Initialize default room
if (!rooms.has('general')) {
  rooms.set('general', {
    name: 'general',
    users: new Set(),
    messages: [],
    created: new Date()
  });
}

module.exports = (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  
  // SSE endpoint for receiving messages
  if (pathname === '/api/sse' && req.method === 'GET') {
    const roomId = req.query.room || 'general';
    const clientId = req.query.clientId || Math.random().toString(36).substr(2, 9);
    
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    
    // Store connection
    connections.set(clientId, {
      res,
      room: roomId,
      lastPing: Date.now()
    });
    
    // Join room
    const room = rooms.get(roomId);
    if (room) {
      room.users.add(clientId);
    }
    
    // Send initial data
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      clientId,
      room: roomId,
      users: room ? room.users.size : 0
    })}\n\n`);
    
    // Send recent messages
    if (room && room.messages.length > 0) {
      room.messages.forEach(msg => {
        res.write(`data: ${JSON.stringify(msg)}\n\n`);
      });
    }
    
    // Keep connection alive
    const pingInterval = setInterval(() => {
      res.write(': ping\n\n');
    }, 30000);
    
    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(pingInterval);
      connections.delete(clientId);
      
      // Remove from room
      if (room) {
        room.users.delete(clientId);
      }
    });
    
    return;
  }
  
  // Send message endpoint
  if (pathname === '/api/message' && req.method === 'POST') {
    return handlePost(req, res, (data) => {
      const { room, username, text, type } = data;
      
      if (!rooms.has(room)) {
        rooms.set(room, {
          name: room,
          users: new Set(),
          messages: [],
          created: new Date()
        });
      }
      
      const roomData = rooms.get(room);
      const message = {
        type: type || 'message',
        username: username || 'Anonymous',
        text: text.trim(),
        room,
        timestamp: new Date().toISOString(),
        id: Math.random().toString(36).substr(2, 9)
      };
      
      // Store message (keep last 50 messages)
      roomData.messages.push(message);
      if (roomData.messages.length > 50) {
        roomData.messages.shift();
      }
      
      // Broadcast to all connections in the room
      connections.forEach((conn, clientId) => {
        if (conn.room === room && conn.res && !conn.res.destroyed) {
          try {
            conn.res.write(`data: ${JSON.stringify(message)}\n\n`);
          } catch (error) {
            // Connection might be dead, remove it
            connections.delete(clientId);
          }
        }
      });
      
      // Update user count
      broadcastToRoom(room, {
        type: 'userCount',
        count: roomData.users.size
      });
      
      res.json({ success: true, id: message.id });
    });
  }
  
  // Create room endpoint
  if (pathname === '/api/room' && req.method === 'POST') {
    return handlePost(req, res, (data) => {
      const { room } = data;
      
      if (!room || !room.trim()) {
        return res.status(400).json({ error: 'Room name required' });
      }
      
      if (rooms.has(room)) {
        return res.status(400).json({ error: 'Room already exists' });
      }
      
      rooms.set(room, {
        name: room,
        users: new Set(),
        messages: [],
        created: new Date()
      });
      
      // Broadcast room list update
      broadcastRoomList();
      
      res.json({ success: true, room });
    });
  }
  
  // Get room list
  if (pathname === '/api/rooms' && req.method === 'GET') {
    const roomList = Array.from(rooms.keys());
    res.json({ rooms: roomList });
  }
  
  res.status(404).json({ error: 'Not found' });
};

function handlePost(req, res, callback) {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      callback(data);
    } catch (error) {
      res.status(400).json({ error: 'Invalid JSON' });
    }
  });
}

function broadcastToRoom(roomName, message) {
  connections.forEach((conn, clientId) => {
    if (conn.room === roomName && conn.res && !conn.res.destroyed) {
      try {
        conn.res.write(`data: ${JSON.stringify(message)}\n\n`);
      } catch (error) {
        connections.delete(clientId);
      }
    }
  });
}

function broadcastRoomList() {
  const roomList = Array.from(rooms.keys());
  connections.forEach((conn) => {
    if (conn.res && !conn.res.destroyed) {
      try {
        conn.res.write(`data: ${JSON.stringify({
          type: 'roomList',
          rooms: roomList
        })}\n\n`);
      } catch (error) {
        connections.delete(conn.id);
      }
    }
  });
}