// Netlify Function for handling chat API
const rooms = new Map();
const connections = new Map();

// No default room - private room system
// Rooms are created on-demand when users join them

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
      // No room list for private rooms
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: 'Private chat system' })
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
          replyTo: data.replyTo || null,
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

      // No create room function needed for private rooms
      // Users can join any room by name

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