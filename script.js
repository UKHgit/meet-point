/**
 * P2P Chat - WebRTC based peer-to-peer chat
 * No servers, no databases - direct browser-to-browser messaging
 * Works on GitHub Pages!
 */

class P2PChat {
    constructor() {
        this.peer = null;
        this.connections = new Map(); // peerId -> connection
        this.username = '';
        this.currentRoom = null;
        this.myPeerId = null;
        this.replyingTo = null;
        this.onlineUsers = new Map(); // peerId -> username
        this.typingUsers = new Set();
        this.typingTimeout = null;
        this.discoveryInterval = null;
        this.announcementInterval = null;

        this.initializeElements();
        this.bindEvents();
        this.promptUsername();

        console.log('P2P Chat initialized');
    }

    initializeElements() {
        this.elements = {};

        const elementIds = [
            'messages', 'messageInput', 'sendBtn', 'username', 'userCount',
            'roomNameInput', 'joinRoomBtn', 'currentRoomDisplay', 'replyPreview',
            'replyUsername', 'replyText', 'cancelReply', 'changeNameBtn', 'menuToggle',
            'mobileTitle', 'mobileUsers', 'onlineUsersList',
            'typingIndicator', 'typingText', 'roomName', 'connectionStatus'
        ];

        elementIds.forEach(id => {
            this.elements[id] = document.getElementById(id);
        });

        this.elements.sidebar = document.querySelector('.sidebar');
    }

    bindEvents() {
        // Message sending
        if (this.elements.sendBtn) {
            this.elements.sendBtn.addEventListener('click', (e) => {
                e.preventDefault();
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

            this.elements.messageInput.addEventListener('input', () => {
                this.elements.messageInput.style.height = 'auto';
                this.elements.messageInput.style.height = Math.min(this.elements.messageInput.scrollHeight, 120) + 'px';

                // Send typing indicator
                if (this.elements.messageInput.value.trim()) {
                    this.broadcastTyping();
                }
            });
        }

        // Username change
        if (this.elements.changeNameBtn) {
            this.elements.changeNameBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.changeUsername();
            });
        }

        if (this.elements.username) {
            this.elements.username.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.changeUsername();
                }
            });
        }

        // Room joining
        if (this.elements.joinRoomBtn) {
            this.elements.joinRoomBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.joinRoom();
            });
        }

        if (this.elements.roomNameInput) {
            this.elements.roomNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.joinRoom();
                }
            });
        }

        // Reply handling
        if (this.elements.cancelReply) {
            this.elements.cancelReply.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelReply();
            });
        }

        // Mobile menu
        if (this.elements.menuToggle) {
            this.elements.menuToggle.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleMobileMenu();
            });
        }

        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && this.elements.sidebar && this.elements.menuToggle) {
                if (!this.elements.sidebar.contains(e.target) && !this.elements.menuToggle.contains(e.target)) {
                    this.elements.sidebar.classList.remove('expanded');
                }
            }
        });

        window.addEventListener('resize', () => this.handleResize());

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            this.broadcastLeave();
            if (this.peer) {
                this.peer.destroy();
            }
        });
    }

    promptUsername() {
        const savedUsername = localStorage.getItem('chatUsername');
        if (savedUsername && savedUsername.trim()) {
            this.username = savedUsername.trim();
            if (this.elements.username) {
                this.elements.username.value = this.username;
            }
        } else {
            let name = prompt('Please enter your nickname:');
            if (name === null || name.trim() === '') {
                name = 'User' + Math.random().toString(36).substr(2, 4);
            }
            this.username = name.trim();
            if (this.elements.username) {
                this.elements.username.value = this.username;
            }
            localStorage.setItem('chatUsername', this.username);
        }
    }

    updateConnectionStatus(status, type = 'info') {
        if (this.elements.connectionStatus) {
            const icons = {
                'connecting': '🟡',
                'connected': '🟢',
                'error': '🔴',
                'info': '⚪'
            };
            this.elements.connectionStatus.textContent = `${icons[type]} ${status}`;
        }
    }

    generateRoomPeerId(roomName, index) {
        // Generate deterministic peer IDs for a room
        // This allows users to find each other without a central server
        const hash = this.hashCode(roomName);
        return `p2pchat-${hash}-${index}`;
    }

    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    async joinRoom() {
        const roomInput = this.elements.roomNameInput;
        if (!roomInput) return;

        const roomName = roomInput.value.trim().toLowerCase();
        if (!roomName) {
            this.addSystemMessage('Please enter a room name');
            return;
        }

        // Leave current room
        if (this.currentRoom) {
            this.leaveRoom();
        }

        this.currentRoom = roomName;

        if (this.elements.currentRoomDisplay) {
            this.elements.currentRoomDisplay.textContent = roomName;
        }
        if (this.elements.mobileTitle) {
            this.elements.mobileTitle.textContent = roomName;
        }
        if (this.elements.roomName) {
            this.elements.roomName.textContent = roomName;
        }

        roomInput.value = '';
        this.clearMessages();

        if (window.innerWidth <= 768 && this.elements.sidebar) {
            this.elements.sidebar.classList.remove('expanded');
        }

        this.updateConnectionStatus('Connecting...', 'connecting');
        this.addSystemMessage(`Joining room "${roomName}"...`);

        // Initialize PeerJS
        await this.initializePeer();
    }

    async initializePeer() {
        // Destroy existing peer
        if (this.peer) {
            this.peer.destroy();
        }

        // Create a unique peer ID for this user in this room
        const uniqueId = `p2pchat-${this.hashCode(this.currentRoom)}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

        return new Promise((resolve, reject) => {
            this.peer = new Peer(uniqueId, {
                debug: 0 // Set to 3 for debugging
            });

            this.peer.on('open', (id) => {
                console.log('My peer ID:', id);
                this.myPeerId = id;
                this.updateConnectionStatus('Connected', 'connected');
                this.addSystemMessage(`You joined "${this.currentRoom}" as ${this.username}`);
                this.addSystemMessage('💡 Share this room name with others to chat!');

                // Add self to online users
                this.onlineUsers.set(id, this.username);
                this.updateOnlineUsersDisplay();

                // Start discovering other peers
                this.startPeerDiscovery();

                // Start announcing presence
                this.startAnnouncement();

                resolve(id);
            });

            this.peer.on('connection', (conn) => {
                this.handleIncomingConnection(conn);
            });

            this.peer.on('error', (err) => {
                console.error('PeerJS error:', err);
                if (err.type === 'unavailable-id') {
                    // ID taken, try again with different ID
                    setTimeout(() => this.initializePeer(), 500);
                } else if (err.type === 'peer-unavailable') {
                    // Peer not found, ignore (expected when scanning)
                } else {
                    this.updateConnectionStatus('Connection error', 'error');
                }
            });

            this.peer.on('disconnected', () => {
                this.updateConnectionStatus('Disconnected', 'error');
                // Try to reconnect
                setTimeout(() => {
                    if (this.peer && !this.peer.destroyed) {
                        this.peer.reconnect();
                    }
                }, 3000);
            });
        });
    }

    handleIncomingConnection(conn) {
        console.log('Incoming connection from:', conn.peer);

        conn.on('open', () => {
            this.connections.set(conn.peer, conn);

            // Send our info
            conn.send({
                type: 'hello',
                username: this.username,
                peerId: this.myPeerId
            });

            // Share known peers
            const knownPeers = Array.from(this.onlineUsers.entries()).map(([id, name]) => ({
                peerId: id,
                username: name
            }));
            conn.send({
                type: 'peers',
                peers: knownPeers
            });
        });

        conn.on('data', (data) => {
            this.handleMessage(conn.peer, data);
        });

        conn.on('close', () => {
            this.handlePeerDisconnect(conn.peer);
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
            this.handlePeerDisconnect(conn.peer);
        });
    }

    connectToPeer(peerId) {
        if (peerId === this.myPeerId) return;
        if (this.connections.has(peerId)) return;

        console.log('Connecting to peer:', peerId);

        const conn = this.peer.connect(peerId, {
            reliable: true
        });

        conn.on('open', () => {
            console.log('Connected to:', peerId);
            this.connections.set(peerId, conn);

            // Send our info
            conn.send({
                type: 'hello',
                username: this.username,
                peerId: this.myPeerId
            });
        });

        conn.on('data', (data) => {
            this.handleMessage(peerId, data);
        });

        conn.on('close', () => {
            this.handlePeerDisconnect(peerId);
        });

        conn.on('error', (err) => {
            // Ignore peer-unavailable errors during discovery
            if (err.type !== 'peer-unavailable') {
                console.error('Connection error:', err);
            }
        });
    }

    handleMessage(fromPeerId, data) {
        switch (data.type) {
            case 'hello':
                // New peer introduced themselves
                if (!this.onlineUsers.has(data.peerId)) {
                    this.onlineUsers.set(data.peerId, data.username);
                    this.updateOnlineUsersDisplay();
                    this.addSystemMessage(`${data.username} joined the room`);
                }
                break;

            case 'peers':
                // Received list of known peers, connect to them
                data.peers.forEach(peer => {
                    if (peer.peerId !== this.myPeerId && !this.connections.has(peer.peerId)) {
                        this.onlineUsers.set(peer.peerId, peer.username);
                        this.connectToPeer(peer.peerId);
                    }
                });
                this.updateOnlineUsersDisplay();
                break;

            case 'message':
                this.addMessage({
                    id: data.id,
                    username: data.username,
                    text: data.text,
                    replyTo: data.replyTo,
                    timestamp: data.timestamp
                }, false);
                break;

            case 'typing':
                this.showTypingIndicator(data.username);
                break;

            case 'leave':
                this.handlePeerDisconnect(fromPeerId, data.username);
                break;

            case 'ping':
                // Respond to keepalive ping
                const conn = this.connections.get(fromPeerId);
                if (conn && conn.open) {
                    conn.send({ type: 'pong', username: this.username });
                }
                break;

            case 'pong':
                // Peer is still alive
                if (data.username) {
                    this.onlineUsers.set(fromPeerId, data.username);
                }
                break;
        }
    }

    handlePeerDisconnect(peerId, username = null) {
        const name = username || this.onlineUsers.get(peerId) || 'Someone';
        this.connections.delete(peerId);

        if (this.onlineUsers.has(peerId)) {
            this.onlineUsers.delete(peerId);
            this.addSystemMessage(`${name} left the room`);
            this.updateOnlineUsersDisplay();
        }
    }

    startPeerDiscovery() {
        // Store our peer ID in localStorage so other tabs can find us
        this.announcePresence();

        // Check for other peers periodically
        this.discoveryInterval = setInterval(() => {
            this.discoverPeers();
        }, 2000);

        // Initial discovery
        this.discoverPeers();
    }

    announcePresence() {
        if (!this.currentRoom || !this.myPeerId) return;

        const storageKey = `p2p_room_${this.currentRoom}`;
        let peers = {};
        try {
            peers = JSON.parse(localStorage.getItem(storageKey) || '{}');
        } catch (e) {
            peers = {};
        }

        peers[this.myPeerId] = {
            username: this.username,
            timestamp: Date.now()
        };

        // Clean old entries
        const now = Date.now();
        for (const id in peers) {
            if (now - peers[id].timestamp > 10000) {
                delete peers[id];
            }
        }

        localStorage.setItem(storageKey, JSON.stringify(peers));
    }

    discoverPeers() {
        if (!this.currentRoom) return;

        const storageKey = `p2p_room_${this.currentRoom}`;
        let peers = {};
        try {
            peers = JSON.parse(localStorage.getItem(storageKey) || '{}');
        } catch (e) {
            return;
        }

        const now = Date.now();
        for (const peerId in peers) {
            if (peerId !== this.myPeerId && now - peers[peerId].timestamp < 10000) {
                if (!this.connections.has(peerId)) {
                    this.connectToPeer(peerId);
                }
            }
        }
    }

    startAnnouncement() {
        // Announce presence every 3 seconds
        this.announcementInterval = setInterval(() => {
            this.announcePresence();

            // Also send ping to all connections to keep them alive
            this.connections.forEach((conn, peerId) => {
                if (conn.open) {
                    conn.send({ type: 'ping' });
                } else {
                    this.connections.delete(peerId);
                }
            });
        }, 3000);
    }

    leaveRoom() {
        this.broadcastLeave();

        if (this.discoveryInterval) {
            clearInterval(this.discoveryInterval);
            this.discoveryInterval = null;
        }
        if (this.announcementInterval) {
            clearInterval(this.announcementInterval);
            this.announcementInterval = null;
        }

        // Close all connections
        this.connections.forEach((conn) => {
            conn.close();
        });
        this.connections.clear();
        this.onlineUsers.clear();

        // Remove from localStorage
        if (this.currentRoom && this.myPeerId) {
            const storageKey = `p2p_room_${this.currentRoom}`;
            try {
                let peers = JSON.parse(localStorage.getItem(storageKey) || '{}');
                delete peers[this.myPeerId];
                localStorage.setItem(storageKey, JSON.stringify(peers));
            } catch (e) { }
        }

        if (this.peer && !this.peer.destroyed) {
            this.peer.destroy();
        }

        this.currentRoom = null;
        this.updateConnectionStatus('Not connected', 'info');
    }

    broadcastLeave() {
        this.broadcast({
            type: 'leave',
            username: this.username
        });
    }

    broadcast(data) {
        this.connections.forEach((conn, peerId) => {
            if (conn.open) {
                try {
                    conn.send(data);
                } catch (e) {
                    console.error('Error sending to', peerId, e);
                }
            }
        });
    }

    broadcastTyping() {
        this.broadcast({
            type: 'typing',
            username: this.username
        });
    }

    sendMessage() {
        if (!this.elements.messageInput) return;

        const text = this.elements.messageInput.value.trim();
        if (!text) return;

        if (!this.currentRoom) {
            this.addSystemMessage('Please join a room first');
            return;
        }

        const message = {
            type: 'message',
            id: Math.random().toString(36).substr(2, 9),
            username: this.username,
            text: text,
            replyTo: this.replyingTo ? {
                username: this.replyingTo.username,
                text: this.replyingTo.text.substring(0, 100)
            } : null,
            timestamp: new Date().toISOString()
        };

        // Send to all peers
        this.broadcast(message);

        // Show locally
        this.addMessage(message, true);

        // Clear input
        this.elements.messageInput.value = '';
        this.elements.messageInput.style.height = 'auto';

        // Clear reply
        this.replyingTo = null;
        if (this.elements.replyPreview) {
            this.elements.replyPreview.style.display = 'none';
        }
    }

    addMessage(data, isSent) {
        // Check for duplicate
        const existing = document.querySelector(`[data-message-id="${data.id}"]`);
        if (existing) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
        messageDiv.dataset.messageId = data.id;

        messageDiv.onclick = (e) => {
            if (e.target.closest('.message-text') || e.target.closest('.message-username')) {
                this.replyToMessage(data);
            }
        };

        const content = document.createElement('div');
        content.className = 'message-content';

        if (data.replyTo && data.replyTo.username) {
            const replyDiv = document.createElement('div');
            replyDiv.className = 'message-reply';
            replyDiv.innerHTML = `
                <span class="reply-tag">↩ @${this.escapeHtml(data.replyTo.username)}</span>
                <span class="reply-text">${this.escapeHtml(data.replyTo.text)}</span>
            `;
            content.appendChild(replyDiv);
        }

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

        if (!isSent) {
            header.appendChild(username);
            header.appendChild(time);
            content.appendChild(header);
        }

        content.appendChild(text);

        if (isSent) {
            const sentTime = document.createElement('div');
            sentTime.className = 'message-header sent-time';
            sentTime.appendChild(time);
            content.appendChild(sentTime);
        }

        messageDiv.appendChild(content);

        if (this.elements.messages) {
            this.elements.messages.appendChild(messageDiv);
            this.scrollToBottom();
        }
    }

    addSystemMessage(text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'system-message';
        messageDiv.innerHTML = `<span class="system-icon">ℹ️</span> ${this.escapeHtml(text)}`;

        if (this.elements.messages) {
            this.elements.messages.appendChild(messageDiv);
            this.scrollToBottom();
        }
    }

    clearMessages() {
        if (this.elements.messages) {
            this.elements.messages.innerHTML = '';
        }
    }

    scrollToBottom() {
        if (this.elements.messages) {
            this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
        }
    }

    replyToMessage(message) {
        this.replyingTo = message;
        if (this.elements.replyPreview) {
            this.elements.replyPreview.style.display = 'flex';
        }
        if (this.elements.replyUsername) {
            this.elements.replyUsername.textContent = `Replying to @${message.username}`;
        }
        if (this.elements.replyText) {
            this.elements.replyText.textContent = message.text.substring(0, 100);
        }
        if (this.elements.messageInput) {
            this.elements.messageInput.focus();
        }
    }

    cancelReply() {
        this.replyingTo = null;
        if (this.elements.replyPreview) {
            this.elements.replyPreview.style.display = 'none';
        }
        if (this.elements.messageInput) {
            this.elements.messageInput.focus();
        }
    }

    changeUsername() {
        const newName = this.elements.username ? this.elements.username.value.trim() : '';

        if (newName && newName !== this.username) {
            const oldName = this.username;
            this.username = newName;
            localStorage.setItem('chatUsername', this.username);
            this.addSystemMessage(`Nickname: "${oldName}" → "${this.username}"`);

            // Update in online users
            if (this.myPeerId) {
                this.onlineUsers.set(this.myPeerId, this.username);
                this.updateOnlineUsersDisplay();
            }

            // Announce new name to peers
            this.broadcast({
                type: 'hello',
                username: this.username,
                peerId: this.myPeerId
            });
        } else if (!newName) {
            const name = prompt('Enter your new nickname:', this.username);
            if (name && name.trim()) {
                const oldName = this.username;
                this.username = name.trim();
                if (this.elements.username) {
                    this.elements.username.value = this.username;
                }
                localStorage.setItem('chatUsername', this.username);
                this.addSystemMessage(`Nickname: "${oldName}" → "${this.username}"`);

                if (this.myPeerId) {
                    this.onlineUsers.set(this.myPeerId, this.username);
                    this.updateOnlineUsersDisplay();
                }
            }
        }
    }

    showTypingIndicator(username) {
        if (!username || username === this.username) return;

        this.typingUsers.add(username);

        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        this.typingTimeout = setTimeout(() => {
            this.typingUsers.delete(username);
            this.updateTypingIndicator();
        }, 3000);

        this.updateTypingIndicator();
    }

    updateTypingIndicator() {
        if (!this.elements.typingIndicator) return;

        const typers = Array.from(this.typingUsers);
        if (typers.length === 0) {
            this.elements.typingIndicator.style.display = 'none';
        } else if (typers.length === 1) {
            if (this.elements.typingText) {
                this.elements.typingText.textContent = `${typers[0]} is typing...`;
            }
            this.elements.typingIndicator.style.display = 'block';
        } else {
            if (this.elements.typingText) {
                this.elements.typingText.textContent = `${typers.length} people are typing...`;
            }
            this.elements.typingIndicator.style.display = 'block';
        }
    }

    updateOnlineUsersDisplay() {
        const count = this.onlineUsers.size;
        const userText = `${count} user${count !== 1 ? 's' : ''}`;

        if (this.elements.userCount) {
            this.elements.userCount.textContent = userText;
        }
        if (this.elements.mobileUsers) {
            this.elements.mobileUsers.textContent = userText;
        }

        if (this.elements.onlineUsersList) {
            if (count === 0) {
                this.elements.onlineUsersList.innerHTML = '<div class="no-users">No users online</div>';
            } else {
                const usersHtml = Array.from(this.onlineUsers.entries()).map(([id, username]) => {
                    const isMe = id === this.myPeerId;
                    return `
                        <div class="online-user ${isMe ? 'is-me' : ''}" data-id="${id}">
                            <span class="online-user-status">●</span>
                            <span class="online-user-name">${this.escapeHtml(username)}${isMe ? ' (you)' : ''}</span>
                        </div>
                    `;
                }).join('');
                this.elements.onlineUsersList.innerHTML = usersHtml;
            }
        }
    }

    toggleMobileMenu() {
        if (this.elements.sidebar) {
            this.elements.sidebar.classList.toggle('expanded');
        }
    }

    handleResize() {
        if (window.innerWidth > 768 && this.elements.sidebar) {
            this.elements.sidebar.classList.remove('expanded');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('Starting P2P Chat...');
    window.chatApp = new P2PChat();
});