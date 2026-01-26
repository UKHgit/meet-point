// Netlify Function for handling chat API
const rooms = new Map();
const connections = new Map();

// Initialize default room
rooms.set('general', {
  name: 'general',
  users: new Set(),
  messages: [],
  created: new Date()
});

exports.handler = async (event, context) => {
  const { httpMethod, path, body } = event;
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers
    };
  }

  try {
    if (path === '/.netlify/functions/chat' && httpMethod === 'GET') {
      // Get room list
      const roomList = Array.from(rooms.keys());
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ rooms: roomList })
      };
    }

    if (path === '/.netlify/functions/chat' && httpMethod === 'POST') {
      const data = JSON.parse(body);
      const { type, room, username, text } = data;

      if (type === 'message') {
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
          type: 'message',
          username: username || 'Anonymous',
          text: text.trim(),
          room,
          timestamp: new Date().toISOString(),
          id: Math.random().toString(36).substr(2, 9)
        };

        // Store message (keep last 50)
        roomData.messages.push(message);
        if (roomData.messages.length > 50) {
          roomData.messages.shift();
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, message })
        };
      }

      if (type === 'createRoom') {
        if (rooms.has(room)) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Room already exists' })
          };
        }

        rooms.set(room, {
          name: room,
          users: new Set(),
          messages: [],
          created: new Date()
        });

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, room })
        };
      }

      if (type === 'getMessages') {
        const roomData = rooms.get(room);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            messages: roomData ? roomData.messages : [],
            users: roomData ? roomData.users.size : 0
          })
        };
      }
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Not found' })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};