class ChatApp {
    constructor() {
        this.eventSource = null;
        this.currentRoom = 'general';
        this.username = 'Anonymous';
        this.isConnected = false;
        this.clientId = Math.random().toString(36).substr(2, 9);
        
        this.initializeElements();
        this.bindEvents();
        this.connect();
    }

    initializeElements() {
        this.elements = {
            messages: document.getElementById('messages'),
            messageInput: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendBtn'),
            username: document.getElementById('username'),
            roomName: document.getElementById('roomName'),
            userCount: document.getElementById('userCount'),
            roomList: document.querySelector('.room-list'),
            newRoomName: document.getElementById('newRoomName'),
            createRoomBtn: document.getElementById('createRoomBtn')
        };
    }

    bindEvents() {
        // Message sending
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        this.elements.messageInput.addEventListener('input', () => {
            this.elements.messageInput.style.height = 'auto';
            this.elements.messageInput.style.height = Math.min(this.elements.messageInput.scrollHeight, 120) + 'px';
        });

        // Username change
        this.elements.username.addEventListener('change', async () => {
            this.username = this.elements.username.value.trim() || 'Anonymous';
            if (this.isConnected) {
                if (this.socket) {
                    this.socket.send(JSON.stringify({
                        type: 'username',
                        username: this.username
                    }));
                } else {
                    // Send system message for username change in SSE
                    await this.sendSystemMessage(`${this.elements.username.previousValue || 'Anonymous'} is now known as ${this.username}`);
                    this.elements.username.previousValue = this.username;
                }
            }
        });

        // Room creation
        this.elements.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.elements.newRoomName.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.createRoom();
            }
        });

        // Room switching
        this.elements.roomList.addEventListener('click', (e) => {
            if (e.target.classList.contains('room-item')) {
                this.joinRoom(e.target.dataset.room);
            }
        });
    }

    connect() {
        // Check if we're on Vercel (no WebSocket support on free tier)
        if (window.location.hostname.includes('vercel.app') || window.location.hostname.includes('vercel.com')) {
            this.connectSSE();
        } else {
            this.connectWebSocket();
        }
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            this.isConnected = true;
            this.addSystemMessage('Connected to chat server');
            this.joinRoom(this.currentRoom);
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };

        this.socket.onclose = () => {
            this.isConnected = false;
            this.addSystemMessage('Disconnected from chat server');
            this.elements.sendBtn.disabled = true;
            
            // Attempt to reconnect after 3 seconds
            setTimeout(() => {
                this.connect();
            }, 3000);
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.addSystemMessage('Connection error');
        };
    }

    connectSSE() {
        const sseUrl = `/api/sse?room=${encodeURIComponent(this.currentRoom)}&clientId=${this.clientId}`;
        
        this.eventSource = new EventSource(sseUrl);
        
        this.eventSource.onopen = () => {
            this.isConnected = true;
            this.addSystemMessage('Connected to chat server');
        };

        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };

        this.eventSource.onerror = (error) => {
            console.error('SSE error:', error);
            this.addSystemMessage('Connection error, attempting to reconnect...');
            this.isConnected = false;
            this.elements.sendBtn.disabled = true;
            
            // Attempt to reconnect after 3 seconds
            setTimeout(() => {
                this.eventSource.close();
                this.connectSSE();
            }, 3000);
        };
    }

    handleMessage(data) {
        switch (data.type) {
            case 'message':
                this.addMessage(data);
                break;
            case 'system':
                this.addSystemMessage(data.text);
                break;
            case 'userCount':
                this.updateUserCount(data.count);
                break;
            case 'roomList':
                this.updateRoomList(data.rooms);
                break;
            case 'joinedRoom':
                this.currentRoom = data.room;
                this.elements.roomName.textContent = data.room;
                this.highlightCurrentRoom();
                this.clearMessages();
                break;
        }
    }

    async sendMessage() {
        const text = this.elements.messageInput.value.trim();
        if (!text || !this.isConnected) return;

        const message = {
            type: 'message',
            text: text,
            room: this.currentRoom,
            username: this.username
        };

        try {
            if (this.socket) {
                this.socket.send(JSON.stringify(message));
            } else {
                // Use HTTP POST for SSE
                const response = await fetch('/api/message', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(message)
                });
                
                if (!response.ok) {
                    throw new Error('Failed to send message');
                }
            }
            
            this.elements.messageInput.value = '';
            this.elements.messageInput.style.height = 'auto';
        } catch (error) {
            console.error('Error sending message:', error);
            this.addSystemMessage('Failed to send message');
        }
    }

    addMessage(data) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = data.username.charAt(0).toUpperCase();
        
        const content = document.createElement('div');
        content.className = 'message-content';
        
        const header = document.createElement('div');
        header.className = 'message-header';
        
        const username = document.createElement('span');
        username.className = 'message-username';
        username.textContent = data.username;
        
        const time = document.createElement('span');
        time.className = 'message-time';
        time.textContent = new Date(data.timestamp).toLocaleTimeString();
        
        const text = document.createElement('div');
        text.className = 'message-text';
        text.textContent = data.text;
        
        header.appendChild(username);
        header.appendChild(time);
        content.appendChild(header);
        content.appendChild(text);
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);
        
        this.elements.messages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    addSystemMessage(text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'system-message';
        messageDiv.textContent = text;
        
        this.elements.messages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    clearMessages() {
        this.elements.messages.innerHTML = '';
    }

    scrollToBottom() {
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
    }

    async createRoom() {
        const roomName = this.elements.newRoomName.value.trim();
        if (!roomName) return;
        
        try {
            if (this.socket) {
                this.socket.send(JSON.stringify({
                    type: 'createRoom',
                    room: roomName
                }));
            } else {
                // Use HTTP POST for SSE
                const response = await fetch('/api/room', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ room: roomName })
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    this.addSystemMessage(error.error || 'Failed to create room');
                    return;
                }
            }
            
            this.elements.newRoomName.value = '';
        } catch (error) {
            console.error('Error creating room:', error);
            this.addSystemMessage('Failed to create room');
        }
    }

    async joinRoom(room) {
        if (room === this.currentRoom) return;
        
        if (this.socket) {
            this.socket.send(JSON.stringify({
                type: 'joinRoom',
                room: room
            }));
        } else {
            // Reconnect SSE with new room
            this.currentRoom = room;
            this.elements.roomName.textContent = room;
            this.highlightCurrentRoom();
            this.clearMessages();
            
            // Close current connection and reconnect
            if (this.eventSource) {
                this.eventSource.close();
            }
            this.connectSSE();
            
            await this.sendSystemMessage(`Joined room: ${room}`);
        }
    }

    updateRoomList(rooms) {
        this.elements.roomList.innerHTML = '';
        
        rooms.forEach(room => {
            const roomDiv = document.createElement('div');
            roomDiv.className = 'room-item';
            roomDiv.dataset.room = room;
            roomDiv.textContent = room;
            
            if (room === this.currentRoom) {
                roomDiv.classList.add('active');
            }
            
            this.elements.roomList.appendChild(roomDiv);
        });
    }

    highlightCurrentRoom() {
        const roomItems = this.elements.roomList.querySelectorAll('.room-item');
        roomItems.forEach(item => {
            item.classList.toggle('active', item.dataset.room === this.currentRoom);
        });
    }

    updateUserCount(count) {
        this.elements.userCount.textContent = `${count} user${count !== 1 ? 's' : ''}`;
    }

    async sendSystemMessage(text) {
        try {
            const message = {
                type: 'system',
                text: text,
                room: this.currentRoom,
                username: 'System'
            };
            
            const response = await fetch('/api/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(message)
            });
            
            if (!response.ok) {
                throw new Error('Failed to send system message');
            }
        } catch (error) {
            console.error('Error sending system message:', error);
        }
    }
}

// Initialize the chat app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
});