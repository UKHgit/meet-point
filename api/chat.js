// GitHub Pages API endpoint
export async function handler(request, context) {
    // In-memory storage (resets on rebuild)
    const rooms = new Map();
    
    try {
        // Handle different methods
        if (request.method === 'GET') {
            return handleGet(request, rooms);
        } else if (request.method === 'POST') {
            return await handlePost(request, rooms);
        }
        
        // Handle CORS
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'GitHub Pages API is running' })
        };
        
    } catch (error) {
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'error', error: error.message })
        };
    }
}

async function handleGet(request, rooms) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    if (pathname === '/api/chat') {
        // Get room messages
        const roomParam = url.searchParams.get('room');
        if (!roomParam) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Room parameter required' })
            };
        }
        
        const room = roomParam;
        const roomData = rooms.get(room) || {
            name: room,
            users: new Set(),
            messages: []
        };
        
        rooms.set(room, roomData);
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                success: true,
                room: room,
                messages: roomData.messages,
                users: Array.from(roomData.users)
            })
        };
    }
    
    if (pathname === '/api/rooms') {
        // Get available rooms
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                success: true,
                rooms: Array.from(rooms.keys())
            })
        };
    }
    
    return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Endpoint not found' })
    };
}

async function handlePost(request, rooms) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const body = await request.text();
    let data;
    
    try {
        data = JSON.parse(body);
    } catch (error) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Invalid JSON' })
        };
    }
    
    if (pathname === '/api/message') {
        const { type, text, room, username, replyTo } = data;
        
        if (!text || !text.trim()) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Message text required' })
            };
        }
        
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
            text: text.trim(),
            room: room,
            username: username || 'Anonymous',
            replyTo: replyTo || null,
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                success: true,
                message: message,
                users: Array.from(roomData.users)
            })
        };
    }
    
    return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Endpoint not found' })
    };
}