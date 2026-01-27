const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

class ChatServer {
    constructor() {
        this.rooms = new Map();
        this.clients = new Map();
        
        // No default room - private room system
        // Rooms are created on-demand when users join them
        
        this.createServer();
    }

    createServer() {
        // Create HTTP server for serving static files
        const server = http.createServer((req, res) => {
            const parsedUrl = url.parse(req.url, true);
            let filePath = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;
            filePath = path.join(__dirname, filePath);
            
            // Security check - prevent directory traversal
            if (!filePath.startsWith(__dirname)) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }
            
            // Get file extension
            const ext = path.extname(filePath);
            let contentType = 'text/html';
            
            switch (ext) {
                case '.js':
                    contentType = 'text/javascript';
                    break;
                case '.css':
                    contentType = 'text/css';
                    break;
                case '.json':
                    contentType = 'application/json';
                    break;
            }
            
            // Serve file
            fs.readFile(filePath, (err, content) => {
                if (err) {
                    if (err.code === 'ENOENT') {
                        res.writeHead(404);
                        res.end('File not found');
                    } else {
                        res.writeHead(500);
                        res.end('Server error');
                    }
                } else {
                    res.writeHead(200, { 'Content-Type': contentType });
                    res.end(content);
                }
            });
        });

        // Create WebSocket server
        this.wss = new WebSocket.Server({ server });
        this.setupWebSocketHandlers();
        
        const PORT = process.env.PORT || 8080;
        server.listen(PORT, () => {
            console.log(`Chat server running on port ${PORT}`);
            console.log(`Open http://localhost:${PORT} in your browser`);
        });
    }

    setupWebSocketHandlers() {
        this.wss.on('connection', (ws) => {
            const clientId = this.generateId();
        const client = {
            id: clientId,
            ws: ws,
            username: 'Anonymous',
            room: null,
            joinedAt: new Date()
        };
            
            this.clients.set(clientId, client);
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleMessage(client, message);
                } catch (error) {
                    console.error('Invalid message format:', error);
                }
            });
            
            ws.on('close', () => {
                this.handleDisconnect(client);
            });
            
            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });
            
            // Send initial data
            this.sendToClient(client, {
                type: 'roomList',
                rooms: Array.from(this.rooms.keys())
            });
            
            // Welcome message with instructions
            this.sendToClient(client, {
                type: 'system',
                text: 'Welcome! Join a room by entering its name below. You can set your nickname in the sidebar.'
            });
        });
    }

    handleMessage(client, message) {
        switch (message.type) {
            case 'message':
                this.handleChatMessage(client, message);
                break;
            case 'username':
                this.updateUsername(client, message.username);
                break;
            case 'joinRoom':
                this.joinRoom(client, message.room);
                break;
            case 'createRoom':
                this.createRoom(client, message.room);
                break;
            case 'typing':
                this.handleTyping(client, message.username);
                break;
            case 'read':
                this.handleReadReceipt(client, message.messageId);
                break;
        }
    }

    handleChatMessage(client, message) {
        if (!client.room || !message.text.trim()) return;
        
        const chatMessage = {
            type: 'message',
            id: this.generateId(),
            username: client.username,
            text: message.text.trim(),
            room: client.room,
            replyTo: message.replyTo || null,
            timestamp: new Date().toISOString()
        };
        
        this.broadcastToRoom(client.room, chatMessage);
    }

    handleTyping(client, username) {
        this.broadcastToRoom(client.room, {
            type: 'typing',
            username: username
        });
    }

    handleReadReceipt(client, messageId) {
        this.broadcastToRoom(client.room, {
            type: 'readReceipt',
            messageId: messageId,
            username: client.username
        });
    }

    updateUsername(client, username) {
        const oldUsername = client.username;
        client.username = username.trim() || 'Anonymous';
        
        if (client.room) {
            if (oldUsername !== 'Anonymous' && client.username !== 'Anonymous') {
                this.broadcastToRoom(client.room, {
                    type: 'system',
                    text: `${oldUsername}'s nickname is now: ${client.username}`
                });
            } else if (oldUsername === 'Anonymous' && client.username !== 'Anonymous') {
                this.broadcastToRoom(client.room, {
                    type: 'system',
                    text: `${client.username} has set their nickname`
                });
            }
        }
    }

    joinRoom(client, roomName) {
        if (!this.rooms.has(roomName)) {
            this.rooms.set(roomName, {
                name: roomName,
                users: new Set(),
                messages: [],
                created: new Date()
            });
        }
        
        // Leave current room
        if (client.room) {
            this.broadcastToRoom(client.room, {
                type: 'system',
                text: `${client.username} left the room`
            });
            
            const room = this.rooms.get(client.room);
            if (room) {
                room.users.delete(client.id);
            }
        }
        
        // Join new room
        const room = this.rooms.get(roomName);
        if (room) {
            room.users.add(client.id);
            client.room = roomName;
            client.id = this.generateId();
            
            // Send room users update
            const users = Array.from(room.users).map(id => {
                const user = this.clients.get(id);
                return user ? user.username : 'Anonymous';
            });
            
            this.broadcastToRoom(roomName, {
                type: 'usersUpdate',
                users: users
            });
            
            this.sendToClient(client, {
                type: 'joinedRoom',
                room: roomName
            });
            
            this.broadcastToRoom(roomName, {
                type: 'system',
                text: `${client.username} has joined the room "${roomName}"`
            });
            
            this.updateUserCount(room.users.size);
        }
    }
        
        // Leave current room
        if (client.room) {
            this.leaveRoom(client);
        }
        
        // Join new room
        client.room = roomName;
        const room = this.rooms.get(roomName);
        room.users.add(client.id);
        
        this.sendToClient(client, {
            type: 'joinedRoom',
            room: roomName
        });
        
        this.broadcastToRoom(roomName, {
            type: 'system',
            text: `${client.username} joined the room`
        });
        
        this.updateUserCount(roomName);
        this.sendRoomList();
    }

    leaveRoom(client) {
        if (!client.room) return;
        
        const room = this.rooms.get(client.room);
        if (room) {
            room.users.delete(client.id);
            
            this.broadcastToRoom(client.room, {
                type: 'system',
                text: `${client.username} left the room`
            });
            
            this.updateUserCount(client.room);
        }
        
        client.room = null;
    }

    createRoom(client, roomName) {
        roomName = roomName.trim();
        if (!roomName) return;
        
        if (this.rooms.has(roomName)) {
            this.sendToClient(client, {
                type: 'system',
                text: `Room '${roomName}' already exists`
            });
            return;
        }
        
        // Create new room
        this.rooms.set(roomName, {
            name: roomName,
            users: new Set(),
            created: new Date()
        });
        
        this.sendToClient(client, {
            type: 'system',
            text: `Room '${roomName}' created`
        });
        
        this.sendRoomList();
        
        // Auto-join the created room
        this.joinRoom(client, roomName);
    }

    handleDisconnect(client) {
        this.leaveRoom(client);
        this.clients.delete(client.id);
        this.sendRoomList();
    }

    broadcastToRoom(roomName, message) {
        const room = this.rooms.get(roomName);
        if (!room) return;
        
        room.users.forEach(clientId => {
            const client = this.clients.get(clientId);
            if (client && client.ws.readyState === WebSocket.OPEN) {
                this.sendToClient(client, message);
            }
        });
    }

    sendToClient(client, message) {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    }

    updateUserCount(roomName) {
        const room = this.rooms.get(roomName);
        if (!room) return;
        
        const count = room.users.size;
        this.broadcastToRoom(roomName, {
            type: 'userCount',
            count: count
        });
    }

    sendRoomList() {
        const roomList = Array.from(this.rooms.keys());
        this.clients.forEach(client => {
            this.sendToClient(client, {
                type: 'roomList',
                rooms: roomList
            });
        });
    }

    generateId() {
        return Math.random().toString(36).substr(2, 9);
    }
}

// Start the server
new ChatServer();