/**
 * P2P Chat using Trystero (BitTorrent-based)
 * No servers needed - peers find each other via BitTorrent trackers
 * Works on GitHub Pages!
 */

class P2PChat {
    constructor() {
        this.room = null;
        this.username = '';
        this.currentRoomName = null;
        this.myId = Math.random().toString(36).substr(2, 9);
        this.replyingTo = null;
        this.peers = new Map(); // peerId -> username
        this.sendMessage = null;
        this.sendUserInfo = null;
        this.sendTyping = null;

        this.initializeElements();
        this.bindEvents();
        this.promptUsername();

        console.log('P2P Chat initialized, my ID:', this.myId);
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
                this.handleSendMessage();
            });
        }

        if (this.elements.messageInput) {
            this.elements.messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSendMessage();
                }
            });

            this.elements.messageInput.addEventListener('input', () => {
                this.elements.messageInput.style.height = 'auto';
                this.elements.messageInput.style.height = Math.min(this.elements.messageInput.scrollHeight, 120) + 'px';

                // Send typing indicator
                if (this.elements.messageInput.value.trim() && this.sendTyping) {
                    this.sendTyping({ username: this.username });
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
            if (this.room) {
                this.room.leave();
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

    async joinRoom() {
        const roomInput = this.elements.roomNameInput;
        if (!roomInput) return;

        const roomName = roomInput.value.trim().toLowerCase();
        if (!roomName) {
            this.addSystemMessage('Please enter a room name');
            return;
        }

        // Leave current room
        if (this.room) {
            this.room.leave();
            this.room = null;
            this.peers.clear();
        }

        this.currentRoomName = roomName;

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

        try {
            // Join room using Trystero (BitTorrent trackers)
            const config = { appId: 'p2p-chat-app-2024' };
            this.room = trystero.joinRoom(config, roomName);

            // Set up message channels
            const [sendMsg, getMsg] = this.room.makeAction('message');
            const [sendInfo, getInfo] = this.room.makeAction('userinfo');
            const [sendTyp, getTyp] = this.room.makeAction('typing');

            this.sendMessage = sendMsg;
            this.sendUserInfo = sendInfo;
            this.sendTyping = sendTyp;

            // Handle incoming messages
            getMsg((data, peerId) => {
                this.addMessage({
                    id: data.id,
                    username: data.username,
                    text: data.text,
                    replyTo: data.replyTo,
                    timestamp: data.timestamp
                }, false);
            });

            // Handle user info
            getInfo((data, peerId) => {
                const wasNew = !this.peers.has(peerId);
                this.peers.set(peerId, data.username);
                this.updatePeerList();
                if (wasNew) {
                    this.addSystemMessage(`${data.username} joined the room`);
                }
            });

            // Handle typing
            getTyp((data, peerId) => {
                this.showTypingIndicator(data.username);
            });

            // Handle peer join
            this.room.onPeerJoin(peerId => {
                console.log('Peer joined:', peerId);
                // Send our info to new peer
                this.sendUserInfo({ username: this.username }, peerId);
            });

            // Handle peer leave
            this.room.onPeerLeave(peerId => {
                const username = this.peers.get(peerId) || 'Someone';
                this.peers.delete(peerId);
                this.updatePeerList();
                this.addSystemMessage(`${username} left the room`);
            });

            this.updateStatus('Connected', 'connected');
            this.addSystemMessage(`You joined "${roomName}" as ${this.username}`);
            this.addSystemMessage('💡 Share this room name with others to chat!');

            // Add self to peer list for display
            this.updatePeerList();

        } catch (err) {
            console.error('Error joining room:', err);
            this.updateStatus('Connection failed', 'error');
            this.addSystemMessage('❌ Failed to join room. Please try again.');
        }
    }

    updatePeerList() {
        const count = this.peers.size + 1; // +1 for self
        const userText = `${count} user${count !== 1 ? 's' : ''}`;

        if (this.elements.userCount) {
            this.elements.userCount.textContent = userText;
        }
        if (this.elements.mobileUsers) {
            this.elements.mobileUsers.textContent = userText;
        }

        if (this.elements.onlineUsersList) {
            let html = `
                <div class="online-user is-me">
                    <span class="online-user-status">●</span>
                    <span class="online-user-name">${this.escapeHtml(this.username)} (you)</span>
                </div>
            `;

            this.peers.forEach((username, peerId) => {
                html += `
                    <div class="online-user" data-id="${peerId}">
                        <span class="online-user-status">●</span>
                        <span class="online-user-name">${this.escapeHtml(username)}</span>
                    </div>
                `;
            });

            this.elements.onlineUsersList.innerHTML = html;
        }
    }

    handleSendMessage() {
        if (!this.elements.messageInput) return;

        const text = this.elements.messageInput.value.trim();
        if (!text) return;

        if (!this.room) {
            this.addSystemMessage('Please join a room first');
            return;
        }

        const message = {
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
        if (this.sendMessage) {
            this.sendMessage(message);
        }

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

            // Broadcast new name
            if (this.sendUserInfo) {
                this.sendUserInfo({ username: this.username });
            }
            this.updatePeerList();
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

                if (this.sendUserInfo) {
                    this.sendUserInfo({ username: this.username });
                }
                this.updatePeerList();
            }
        }
    }

    showTypingIndicator(username) {
        if (!username || username === this.username) return;
        if (!this.elements.typingIndicator || !this.elements.typingText) return;

        this.elements.typingText.textContent = `${username} is typing...`;
        this.elements.typingIndicator.style.display = 'block';

        // Hide after 3 seconds
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.elements.typingIndicator.style.display = 'none';
        }, 3000);
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
    console.log('Starting P2P Chat with Trystero...');
    window.chatApp = new P2PChat();
});