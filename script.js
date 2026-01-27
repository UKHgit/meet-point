/**
 * Realtime Chat using Gun.js
 * - Room name in URL (#roomname) for easy sharing
 * - Decentralized, no API keys needed
 * - Works on GitHub Pages!
 */

class RealtimeChat {
    constructor() {
        this.gun = null;
        this.room = null;
        this.username = '';
        this.currentRoomName = null;
        this.clientId = 'user-' + Math.random().toString(36).substr(2, 9);
        this.replyingTo = null;
        this.seenMessages = new Set();
        this.members = new Map();

        this.initializeElements();
        this.bindEvents();
        this.promptUsername();
        this.initGun();

        // Check URL for room name and auto-join
        this.checkUrlForRoom();

        console.log('Realtime Chat initialized, ID:', this.clientId);
    }

    initGun() {
        // Initialize Gun with public relay servers
        this.gun = Gun({
            peers: [
                'https://gun-manhattan.herokuapp.com/gun',
                'https://gun-us.herokuapp.com/gun'
            ]
        });

        this.updateStatus('Ready', 'info');
        console.log('Gun initialized');
    }

    checkUrlForRoom() {
        // Check URL hash for room name (e.g., #lobby)
        const hash = window.location.hash.slice(1); // Remove #
        if (hash && hash.trim()) {
            // Set the room input and auto-join
            if (this.elements.roomNameInput) {
                this.elements.roomNameInput.value = hash;
            }
            // Small delay to ensure everything is loaded
            setTimeout(() => this.joinRoom(), 100);
        }
    }

    updateUrlWithRoom(roomName) {
        // Update URL hash without reloading page
        if (roomName) {
            window.history.replaceState(null, '', '#' + roomName);
        } else {
            window.history.replaceState(null, '', window.location.pathname);
        }
    }

    initializeElements() {
        this.elements = {};

        const elementIds = [
            'messages', 'messageInput', 'sendBtn', 'username', 'userCount',
            'roomNameInput', 'joinRoomBtn', 'currentRoomDisplay', 'replyPreview',
            'replyUsername', 'replyText', 'cancelReply', 'changeNameBtn', 'menuToggle',
            'mobileTitle', 'mobileUsers', 'onlineUsersList', 'roomName', 'connectionStatus',
            'shareLink', 'copyLinkBtn'
        ];

        elementIds.forEach(id => {
            this.elements[id] = document.getElementById(id);
        });

        this.elements.sidebar = document.querySelector('.sidebar');
    }

    bindEvents() {
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
            });
        }

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

        if (this.elements.cancelReply) {
            this.elements.cancelReply.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelReply();
            });
        }

        if (this.elements.menuToggle) {
            this.elements.menuToggle.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleMobileMenu();
            });
        }

        if (this.elements.copyLinkBtn) {
            this.elements.copyLinkBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.copyShareLink();
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

        // Handle browser back/forward with hash changes
        window.addEventListener('hashchange', () => {
            this.checkUrlForRoom();
        });

        window.addEventListener('beforeunload', () => {
            if (this.currentRoomName) {
                this.leaveRoom();
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

    updateStatus(status, type = 'info') {
        if (this.elements.connectionStatus) {
            const icons = { connecting: '🟡', connected: '🟢', error: '🔴', info: '⚪' };
            this.elements.connectionStatus.textContent = `${icons[type]} ${status}`;
        }
    }

    joinRoom() {
        const roomInput = this.elements.roomNameInput;
        if (!roomInput) return;

        const roomName = roomInput.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
        if (!roomName) {
            this.addSystemMessage('Please enter a valid room name');
            return;
        }

        // Leave current room
        if (this.currentRoomName) {
            this.leaveRoom();
        }

        this.currentRoomName = roomName;
        this.seenMessages.clear();

        // Update URL with room name
        this.updateUrlWithRoom(roomName);

        // Update share link display
        if (this.elements.shareLink) {
            const shareUrl = window.location.origin + window.location.pathname + '#' + roomName;
            this.elements.shareLink.value = shareUrl;
        }

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

        this.updateStatus('Connecting...', 'connecting');
        this.addSystemMessage(`Joining room "${roomName}"...`);

        // Get room reference
        this.room = this.gun.get('chat-room-' + roomName);

        // Subscribe to messages
        this.room.get('messages').map().on((data, key) => {
            if (data && !this.seenMessages.has(key)) {
                this.seenMessages.add(key);
                this.handleIncomingMessage(data);
            }
        });

        // Register presence
        this.registerPresence();

        // Subscribe to presence
        this.room.get('presence').map().on((data, key) => {
            if (data && data.online && Date.now() - data.lastSeen < 30000) {
                this.members.set(key, data);
            } else {
                this.members.delete(key);
            }
            this.updateMemberList();
        });

        this.updateStatus('Connected', 'connected');
        this.addSystemMessage(`You joined "${roomName}" as ${this.username}`);
        this.addSystemMessage('📎 Share this page URL to invite others!');
    }

    copyShareLink() {
        if (!this.currentRoomName) {
            this.addSystemMessage('Join a room first to get a share link');
            return;
        }

        const shareUrl = window.location.origin + window.location.pathname + '#' + this.currentRoomName;

        navigator.clipboard.writeText(shareUrl).then(() => {
            this.addSystemMessage('✅ Link copied to clipboard!');
        }).catch(() => {
            // Fallback for older browsers
            if (this.elements.shareLink) {
                this.elements.shareLink.select();
                document.execCommand('copy');
                this.addSystemMessage('✅ Link copied to clipboard!');
            }
        });
    }

    registerPresence() {
        if (!this.room || !this.currentRoomName) return;

        const updatePresence = () => {
            this.room.get('presence').get(this.clientId).put({
                username: this.username,
                color: this.getRandomColor(),
                lastSeen: Date.now(),
                online: true
            });
        };

        updatePresence();

        // Update presence every 10 seconds
        this.presenceInterval = setInterval(updatePresence, 10000);
    }

    leaveRoom() {
        if (this.presenceInterval) {
            clearInterval(this.presenceInterval);
        }

        if (this.room && this.currentRoomName) {
            this.room.get('presence').get(this.clientId).put({
                online: false,
                lastSeen: Date.now()
            });
        }

        this.members.clear();
        this.currentRoomName = null;
        this.room = null;
    }

    handleIncomingMessage(data) {
        // Skip old messages (only show messages from last 5 minutes)
        const msgTime = new Date(data.timestamp).getTime();
        if (Date.now() - msgTime > 5 * 60 * 1000) {
            return;
        }

        this.addMessage({
            id: data.id,
            username: data.username,
            text: data.text,
            replyTo: data.replyTo,
            timestamp: data.timestamp,
            senderId: data.senderId
        }, data.senderId === this.clientId);
    }

    updateMemberList() {
        const count = this.members.size;
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
                let html = '';
                this.members.forEach((data, id) => {
                    const isMe = id === this.clientId;
                    html += `
                        <div class="online-user ${isMe ? 'is-me' : ''}" data-id="${id}">
                            <span class="online-user-status" style="color: ${data.color || '#10b981'}">●</span>
                            <span class="online-user-name">${this.escapeHtml(data.username)}${isMe ? ' (you)' : ''}</span>
                        </div>
                    `;
                });
                this.elements.onlineUsersList.innerHTML = html;
            }
        }
    }

    sendMessage() {
        if (!this.elements.messageInput) return;

        const text = this.elements.messageInput.value.trim();
        if (!text) return;

        if (!this.room) {
            this.addSystemMessage('Please join a room first');
            return;
        }

        const msgId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        const message = {
            id: msgId,
            username: this.username,
            senderId: this.clientId,
            text: text,
            replyTo: this.replyingTo ? {
                username: this.replyingTo.username,
                text: this.replyingTo.text.substring(0, 100)
            } : null,
            timestamp: new Date().toISOString()
        };

        // Store in Gun
        this.room.get('messages').get(msgId).put(message);

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

            if (this.room) {
                this.registerPresence();
            }
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

    getRandomColor() {
        const colors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('Starting Realtime Chat with Gun.js...');
    window.chatApp = new RealtimeChat();
});