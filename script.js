class ChatApp {
    constructor() {
        this.eventSource = null;
        this.currentRoom = null;
        this.username = '';
        this.isConnected = false;
        this.clientId = Math.random().toString(36).substr(2, 9);
        this.replyingTo = null;
        
        // Initialize data structures
        this.onlineUsers = new Map();
        this.typingUsers = new Set();
        this.typingTimeout = null;
        this.readReceipts = new Map();
        
        this.initializeElements();
        this.promptUsername();
        this.bindEvents();
        
        // Enable send button by default
        if (this.elements.sendBtn) {
            this.elements.sendBtn.disabled = false;
        }
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
            changeNameBtn: document.getElementById('changeNameBtn'),
            menuToggle: document.getElementById('menuToggle'),
            mobileTitle: document.getElementById('mobileTitle'),
            mobileUsers: document.getElementById('mobileUsers'),
            sidebar: document.querySelector('.sidebar'),
            onlineUsersList: document.getElementById('onlineUsersList'),
            typingIndicator: document.getElementById('typingIndicator'),
            typingText: document.getElementById('typingText')
        };
        
        // Initialize data structures
        this.onlineUsers = new Map();
        this.typingUsers = new Set();
        this.typingTimeout = null;
        this.readReceipts = new Map();
    }

    bindEvents() {
        // Check if all elements exist
        if (!this.elements.sendBtn || !this.elements.messageInput || !this.elements.username) {
            console.error('Missing essential elements');
            return;
        }

        // Message sending
        if (this.elements.sendBtn) {
            this.elements.sendBtn.addEventListener('click', () => {
                console.log('Send button clicked');
                this.sendMessage();
            });
        }
        if (this.elements.messageInput) {
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
            
            // Handle typing indicator
            if (this.elements.messageInput.value.trim() && this.isConnected && this.currentRoom) {
                this.sendTypingIndicator();
            } else {
                this.stopTypingIndicator();
            }
        });
        }

        // Username change
        if (this.elements.username) {
            this.elements.username.addEventListener('change', () => {
                const newName = this.elements.username.value.trim();
                if (newName && newName !== '') {
                    const oldUsername = this.username;
                    this.username = newName;
                    localStorage.setItem('chatUsername', this.username);
                    this.addSystemMessage(`Your name is now: ${this.username}`);
                    
                    // Send username update to server
                    if (this.socket && this.isConnected) {
                        this.socket.send(JSON.stringify({
                            type: 'username',
                            username: this.username
                        }));
                    }
                } else {
                    // Revert to previous name if empty
                    this.elements.username.value = this.username;
                    alert('Name cannot be empty');
                }
            });
        }

        // Room joining
        if (this.elements.joinRoomBtn) {
            this.elements.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        }
        if (this.elements.roomNameInput) {
            this.elements.roomNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.joinRoom();
                }
            });
        }

        // Reply handling
        if (this.elements.cancelReply) {
            this.elements.cancelReply.addEventListener('click', () => this.cancelReply());
        }
        
        // Change name button
        if (this.elements.changeNameBtn) {
            this.elements.changeNameBtn.addEventListener('click', () => this.changeUsername());
        }
        
        // Mobile menu toggle
        if (this.elements.menuToggle) {
            this.elements.menuToggle.addEventListener('click', () => this.toggleMobileMenu());
        }
        
        // Close mobile menu when clicking outside
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && this.elements.sidebar && this.elements.menuToggle) {
                if (!this.elements.sidebar.contains(e.target) && !this.elements.menuToggle.contains(e.target)) {
                    this.elements.sidebar.classList.remove('expanded');
                }
            }
        });

        // Close mobile menu on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.elements.sidebar && this.elements.sidebar.classList.contains('expanded')) {
                this.elements.sidebar.classList.remove('expanded');
            }
        });
        
        // Handle window resize
        window.addEventListener('resize', () => this.handleResize());
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
            if (this.elements.sendBtn) {
                this.elements.sendBtn.disabled = false;
            }
            
            // Send username to server
            if (this.username && this.username !== 'Anonymous') {
                this.socket.send(JSON.stringify({
                    type: 'username',
                    username: this.username
                }));
            }
            
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
        if (this.elements.sendBtn) {
            this.elements.sendBtn.disabled = false;
        }
        
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
            case 'typing':
                this.showTypingIndicator(data.username);
                break;
            case 'usersUpdate':
                this.updateOnlineUsers(data.users);
                break;
            case 'readReceipt':
                this.addReadReceipt(data.messageId, 'read');
                break;
        }
    }

    async sendMessage() {
        console.log('sendMessage called');
        
        if (!this.elements.messageInput) {
            console.error('Message input not found');
            return;
        }
        
        const text = this.elements.messageInput.value.trim();
        console.log('Text:', text, 'Connected:', this.isConnected);
        
        if (!text) {
            console.log('No text, returning');
            return;
        }
        
        if (!this.isConnected) {
            console.log('Not connected, returning');
            return;
        }
        
        // Ensure we have a username
        console.log('Current username:', this.username);
        if (!this.username || this.username.trim() === '') {
            console.log('No username, prompting...');
            this.promptUsername();
            return;
        }
        
        // Stop typing indicator
        this.stopTypingIndicator();

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
        console.log('Adding message:', data);
        console.log('Current username:', this.username);
        const isSent = data.username === this.username;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
        messageDiv.dataset.messageId = data.id;
        
        // Make message clickable for reply
        messageDiv.style.cursor = 'pointer';
        messageDiv.onclick = (e) => {
            if (!e.target.closest('.reply-tag') && !e.target.closest('.cancel-reply')) {
                this.replyToMessage(data);
            }
        };
        
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
        username.onclick = (e) => {
            e.stopPropagation();
            this.replyToMessage(data);
        };
        
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
        
        // Add read receipt for sent messages
        if (isSent) {
            const receipt = document.createElement('div');
            receipt.className = 'read-receipt delivered';
            receipt.dataset.receiptFor = data.id;
            receipt.textContent = '✓';
            content.appendChild(receipt);
        }
        
        if (isSent) {
            content.appendChild(header);
        }
        
        messageDiv.appendChild(content);
        
        this.elements.messages.appendChild(messageDiv);
        this.scrollToBottom();
        
        // Mark as read if it's not our message
        if (!isSent && this.socket) {
            this.socket.send(JSON.stringify({
                type: 'read',
                messageId: data.id
            }));
        }
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

    toggleMobileMenu() {
        if (this.elements.sidebar) {
            this.elements.sidebar.classList.toggle('expanded');
        }
    }

    handleResize() {
        if (window.innerWidth > 768) {
            this.elements.sidebar.classList.remove('expanded');
        }
    }

    sendTypingIndicator() {
        if (this.socket) {
            this.socket.send(JSON.stringify({
                type: 'typing',
                username: this.username
            }));
        }
    }

    stopTypingIndicator() {
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = null;
        }
    }

    showTypingIndicator(username) {
        if (!username || username === this.username) return;
        
        this.typingUsers.add(username);
        this.typingTimeout = setTimeout(() => {
            this.typingUsers.delete(username);
            this.updateTypingIndicator();
        }, 3000);
        
        this.updateTypingIndicator();
    }

    updateTypingIndicator() {
        if (!this.elements.typingIndicator) return;
        
        const typers = Array.from(this.typingUsers).filter(u => u !== this.username);
        if (typers.length === 0) {
            this.elements.typingIndicator.style.display = 'none';
        } else if (typers.length === 1) {
            this.elements.typingText.textContent = `${typers[0]} is typing...`;
            this.elements.typingIndicator.style.display = 'block';
        } else {
            this.elements.typingText.textContent = `${typers.length} people are typing...`;
            this.elements.typingIndicator.style.display = 'block';
        }
    }

    updateOnlineUsers() {
        if (!this.elements.onlineUsersList) return;
        
        const users = Array.from(this.onlineUsers.keys());
        if (users.length === 0) {
            this.elements.onlineUsersList.innerHTML = '<div class="no-users">No users online</div>';
        } else {
            this.elements.onlineUsersList.innerHTML = users.map(username => `
                <div class="online-user" data-username="${username}">
                    <span class="online-user-name">${username}</span>
                    <span class="online-user-status">●</span>
                </div>
            `).join('');
        }
        
        this.updateUserCount(users.length);
    }

    addReadReceipt(messageId, status = 'delivered') {
        this.readReceipts.set(messageId, status);
        
        const existingReceipt = document.querySelector(`[data-receipt-for="${messageId}"]`);
        if (existingReceipt) {
            existingReceipt.className = `read-receipt ${status}`;
            existingReceipt.textContent = status === 'read' ? '✓✓' : '✓';
        }
    }

    async     joinRoom() {
        const roomName = this.elements.roomNameInput.value.trim();
        if (!roomName) {
            alert('Please enter a room name');
            return;
        }

        this.currentRoom = roomName;
        this.elements.currentRoomDisplay.textContent = roomName;
        this.elements.mobileTitle.textContent = roomName;
        this.elements.roomNameInput.value = '';
        this.clearMessages();
        this.addSystemMessage(`Joined room: ${roomName}`);
        
        // Close mobile menu on mobile only
        if (window.innerWidth <= 768 && this.elements.sidebar) {
            this.elements.sidebar.classList.remove('expanded');
        }
        
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
        const userText = `${count} user${count !== 1 ? 's' : ''}`;
        if (this.elements.userCount) {
            this.elements.userCount.textContent = userText;
        }
        if (this.elements.mobileUsers) {
            this.elements.mobileUsers.textContent = userText;
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