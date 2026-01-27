class ChatApp {
    constructor() {
        this.eventSource = null;
        this.currentRoom = null;
        this.username = '';
        this.isConnected = false;
        this.clientId = Math.random().toString(36).substr(2, 9);
        this.replyingTo = null;
        
        this.initializeElements();
        this.promptUsername();
        this.bindEvents();
    }

    initializeElements() {
        this.elements = {
            messages: document.getElementById('messages'),
            messageInput: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendBtn'),
            username: document.getElementById('username'),
            userCount: document.getElementById('userCount'),
            roomNameInput: document.getElementById('roomNameInput'),
            joinRoomBtn: document.getElementById('joinRoomBtn'),
            currentRoomDisplay: document.getElementById('currentRoomDisplay'),
            replyPreview: document.getElementById('replyPreview'),
            replyUsername: document.getElementById('replyUsername'),
            replyText: document.getElementById('replyText'),
            cancelReply: document.getElementById('cancelReply'),
            changeNameBtn: document.getElementById('changeNameBtn')
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
        this.elements.username.addEventListener('change', () => {
            const newName = this.elements.username.value.trim();
            if (newName && newName !== '') {
                this.username = newName;
                localStorage.setItem('chatUsername', this.username);
                this.addSystemMessage(`Your name is now: ${this.username}`);
            } else {
                // Revert to previous name if empty
                this.elements.username.value = this.username;
                alert('Name cannot be empty');
            }
        });

        // Room joining
        this.elements.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.elements.roomNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinRoom();
            }
        });

        // Reply handling
        this.elements.cancelReply.addEventListener('click', () => this.cancelReply());
        
        // Change name button
        this.elements.changeNameBtn.addEventListener('click', () => this.changeUsername());
    }
    }

    promptUsername() {
        const savedUsername = localStorage.getItem('chatUsername');
        if (savedUsername && savedUsername.trim()) {
            this.username = savedUsername.trim();
            this.elements.username.value = this.username;
        } else {
            // Keep asking until user enters a name
            let name = '';
            while (!name || !name.trim()) {
                name = prompt('Please enter your name:');
                if (name === null) {
                    // User cancelled
                    name = 'Anonymous';
                    break;
                }
                if (name.trim() === '') {
                    alert('Please enter a valid name');
                }
            }
            
            this.username = name.trim();
            this.elements.username.value = this.username;
            localStorage.setItem('chatUsername', this.username);
        }
    }

    connect() {
        // Only connect if we have a room
        if (!this.currentRoom) {
            this.addSystemMessage('Please join a room to start chatting');
            return;
        }

        // Check if we're on Netlify (no WebSocket support on free tier)
        if (window.location.hostname.includes('netlify.app') || window.location.hostname.includes('netlify.com')) {
            this.connectNetlify();
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

    connectNetlify() {
        // Connect to Netlify Functions
        this.isConnected = true;
        this.addSystemMessage('Connected to chat server (Netlify mode)');
        this.elements.sendBtn.disabled = false;
        
        // Load initial messages
        this.loadMessages();
        
        // Start polling for new messages
        this.startPolling();
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

        // Ensure we have a username
        if (!this.username || this.username === 'Anonymous' || this.username.trim() === '') {
            this.promptUsername();
            return;
        }

        const message = {
            type: 'message',
            text: text,
            room: this.currentRoom,
            username: this.username,
            replyTo: this.replyingTo
        };

        try {
            if (this.socket) {
                this.socket.send(JSON.stringify(message));
            } else {
                // Use Netlify Functions
                const response = await fetch('/.netlify/functions/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(message)
                });
                
                if (!response.ok) {
                    throw new Error('Failed to send message');
                }
                
                // Add message locally for instant feedback
                const messageData = {
                    ...message,
                    timestamp: new Date().toISOString(),
                    id: Math.random().toString(36).substr(2, 9)
                };
                this.addMessage(messageData);
            }
            
            this.elements.messageInput.value = '';
            this.elements.messageInput.style.height = 'auto';
            this.cancelReply();
        } catch (error) {
            console.error('Error sending message:', error);
            this.addSystemMessage('Failed to send message');
        }
    }

    addMessage(data) {
        const isSent = data.username === this.username;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
        messageDiv.dataset.messageId = data.id;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = data.username.charAt(0).toUpperCase();
        
        const content = document.createElement('div');
        content.className = 'message-content';
        
        // Add reply info if this is a reply
        if (data.replyTo) {
            const replyDiv = document.createElement('div');
            replyDiv.className = 'message-reply';
            replyDiv.innerHTML = `
                <span class="reply-tag">@${data.replyTo.username}</span> ${data.replyTo.text}
            `;
            content.appendChild(replyDiv);
        }
        
        const header = document.createElement('div');
        header.className = 'message-header';
        
        const username = document.createElement('span');
        username.className = 'message-username';
        username.textContent = data.username;
        username.classList.add('reply-tag');
        username.onclick = () => this.replyToMessage(data);
        
        const time = document.createElement('span');
        time.className = 'message-time';
        time.textContent = new Date(data.timestamp).toLocaleTimeString();
        
        const text = document.createElement('div');
        text.className = 'message-text';
        text.textContent = data.text;
        
        if (!isSent) {
            header.appendChild(username);
            header.appendChild(time);
            content.appendChild(header);
        }
        
        content.appendChild(text);
        
        if (isSent) {
            content.appendChild(header);
            messageDiv.appendChild(content);
            messageDiv.appendChild(avatar);
        } else {
            messageDiv.appendChild(avatar);
            messageDiv.appendChild(content);
        }
        
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

    replyToMessage(message) {
        this.replyingTo = message;
        this.elements.replyPreview.style.display = 'block';
        this.elements.replyUsername.textContent = `Replying to @${message.username}`;
        this.elements.replyText.textContent = message.text;
        this.elements.messageInput.focus();
    }

    cancelReply() {
        this.replyingTo = null;
        this.elements.replyPreview.style.display = 'none';
        this.elements.messageInput.focus();
    }

    changeUsername() {
        const newName = prompt('Enter your new name:', this.username);
        if (newName !== null && newName.trim()) {
            this.username = newName.trim();
            this.elements.username.value = this.username;
            localStorage.setItem('chatUsername', this.username);
            this.addSystemMessage(`Your name is now: ${this.username}`);
        }
    }

    async joinRoom() {
        const roomName = this.elements.roomNameInput.value.trim();
        if (!roomName) {
            alert('Please enter a room name');
            return;
        }

        this.currentRoom = roomName;
        this.elements.currentRoomDisplay.textContent = roomName;
        this.elements.roomNameInput.value = '';
        this.clearMessages();
        this.addSystemMessage(`Joined room: ${roomName}`);
        
        // Close existing connection
        if (this.eventSource) {
            this.eventSource.close();
        }
        if (this.socket) {
            this.socket.close();
        }
        
        this.connect();
    }

    highlightCurrentRoom() {
        // Not needed for private rooms
    }

    updateUserCount(count) {
        if (this.elements.userCount) {
            this.elements.userCount.textContent = `${count} user${count !== 1 ? 's' : ''}`;
        }
    }

    async loadRoomList() {
        // Not needed for private rooms
    }

    async loadMessages() {
        try {
            const response = await fetch('/.netlify/functions/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type: 'getMessages',
                    room: this.currentRoom
                })
            });
            const data = await response.json();
            if (data.messages) {
                this.clearMessages();
                data.messages.forEach(msg => this.addMessage(msg));
            }
            if (data.users !== undefined) {
                this.updateUserCount(data.users);
            }
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    }

    startPolling() {
        // Poll for new messages every 3 seconds
        setInterval(() => {
            if (this.isConnected && !this.socket) {
                this.loadMessages();
            }
        }, 3000);
    }
}

// Initialize the chat app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
});