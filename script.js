/**
 * Realtime Chat - hack.chat style
 * Uses hack.chat's public WebSocket server for real-time messaging
 * Room name in URL for easy sharing
 */

// hack.chat WebSocket server
const WS_URL = 'wss://hack.chat/chat-ws';

class RealtimeChat {
    constructor() {
        this.ws = null;
        this.username = '';
        this.currentRoom = null;
        this.replyingTo = null;
        this.users = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;

        this.initializeElements();
        this.bindEvents();
        this.promptUsername();

        // Check URL for room and auto-join
        this.checkUrlForRoom();

        console.log('Chat initialized');
    }

    initializeElements() {
        this.elements = {};

        const ids = [
            'messages', 'messageInput', 'sendBtn', 'username', 'userCount',
            'roomNameInput', 'joinRoomBtn', 'currentRoomDisplay', 'replyPreview',
            'replyUsername', 'replyText', 'cancelReply', 'changeNameBtn', 'menuToggle',
            'mobileTitle', 'mobileUsers', 'onlineUsersList', 'roomName', 'connectionStatus',
            'shareLink', 'copyLinkBtn'
        ];

        ids.forEach(id => {
            this.elements[id] = document.getElementById(id);
        });

        this.elements.sidebar = document.querySelector('.sidebar');
    }

    bindEvents() {
        // Send message
        if (this.elements.sendBtn) {
            this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
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

        // Join room
        if (this.elements.joinRoomBtn) {
            this.elements.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        }

        if (this.elements.roomNameInput) {
            this.elements.roomNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.joinRoom();
                }
            });
        }

        // Username change
        if (this.elements.changeNameBtn) {
            this.elements.changeNameBtn.addEventListener('click', () => this.changeUsername());
        }

        if (this.elements.username) {
            this.elements.username.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.changeUsername();
                }
            });
        }

        // Reply
        if (this.elements.cancelReply) {
            this.elements.cancelReply.addEventListener('click', () => this.cancelReply());
        }

        // Copy link
        if (this.elements.copyLinkBtn) {
            this.elements.copyLinkBtn.addEventListener('click', () => this.copyShareLink());
        }

        // Mobile menu
        if (this.elements.menuToggle) {
            this.elements.menuToggle.addEventListener('click', () => this.toggleMobileMenu());
        }

        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && this.elements.sidebar && this.elements.menuToggle) {
                if (!this.elements.sidebar.contains(e.target) && !this.elements.menuToggle.contains(e.target)) {
                    this.elements.sidebar.classList.remove('expanded');
                }
            }
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 768 && this.elements.sidebar) {
                this.elements.sidebar.classList.remove('expanded');
            }
        });

        // URL hash change
        window.addEventListener('hashchange', () => this.checkUrlForRoom());

        // Cleanup
        window.addEventListener('beforeunload', () => {
            if (this.ws) {
                this.ws.close();
            }
        });
    }

    checkUrlForRoom() {
        const hash = window.location.hash.slice(1);
        if (hash && hash.trim()) {
            if (this.elements.roomNameInput) {
                this.elements.roomNameInput.value = hash;
            }
            setTimeout(() => this.joinRoom(), 100);
        }
    }

    updateUrl(room) {
        if (room) {
            window.history.replaceState(null, '', '#' + room);
        } else {
            window.history.replaceState(null, '', window.location.pathname);
        }
    }

    promptUsername() {
        const saved = localStorage.getItem('chatUsername');
        if (saved && saved.trim()) {
            this.username = saved.trim();
        } else {
            let name = prompt('Enter your nickname:');
            if (!name || !name.trim()) {
                name = 'User_' + Math.random().toString(36).substr(2, 4);
            }
            this.username = name.trim();
            localStorage.setItem('chatUsername', this.username);
        }

        if (this.elements.username) {
            this.elements.username.value = this.username;
        }
    }

    updateStatus(status, type = 'info') {
        if (this.elements.connectionStatus) {
            const icons = { connecting: '🟡', connected: '🟢', error: '🔴', info: '⚪' };
            this.elements.connectionStatus.textContent = `${icons[type]} ${status}`;
        }
    }

    joinRoom() {
        const input = this.elements.roomNameInput;
        if (!input) return;

        let room = input.value.trim();
        if (!room) {
            this.addSystemMessage('Please enter a room name');
            return;
        }

        // Sanitize room name (hack.chat style - prefix with ? is optional)
        room = room.replace(/^\?/, '');

        // Close existing connection
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.currentRoom = room;
        this.users = [];
        this.reconnectAttempts = 0;

        // Update UI
        this.updateUrl(room);
        this.clearMessages();

        if (this.elements.currentRoomDisplay) {
            this.elements.currentRoomDisplay.textContent = room;
        }
        if (this.elements.mobileTitle) {
            this.elements.mobileTitle.textContent = room;
        }
        if (this.elements.roomName) {
            this.elements.roomName.textContent = room;
        }
        if (this.elements.shareLink) {
            this.elements.shareLink.value = window.location.origin + window.location.pathname + '#' + room;
        }

        input.value = '';

        if (window.innerWidth <= 768 && this.elements.sidebar) {
            this.elements.sidebar.classList.remove('expanded');
        }

        this.updateStatus('Connecting...', 'connecting');
        this.addSystemMessage(`Joining room "${room}"...`);

        // Connect to hack.chat WebSocket
        this.connect();
    }

    connect() {
        try {
            this.ws = new WebSocket(WS_URL);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.reconnectAttempts = 0;

                // Join room (hack.chat protocol)
                this.ws.send(JSON.stringify({
                    cmd: 'join',
                    channel: this.currentRoom,
                    nick: this.username
                }));
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (e) {
                    console.error('Failed to parse message:', e);
                }
            };

            this.ws.onclose = () => {
                console.log('WebSocket closed');
                this.updateStatus('Disconnected', 'error');

                // Try to reconnect
                if (this.currentRoom && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    this.addSystemMessage(`Connection lost. Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
                    setTimeout(() => this.connect(), 3000);
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateStatus('Connection error', 'error');
            };

        } catch (e) {
            console.error('Failed to connect:', e);
            this.updateStatus('Connection failed', 'error');
            this.addSystemMessage('❌ Failed to connect. Please try again.');
        }
    }

    handleMessage(data) {
        switch (data.cmd) {
            case 'onlineSet':
                // Initial user list when joining
                this.users = data.nicks || [];
                this.updateUserList();
                this.updateStatus('Connected', 'connected');
                this.addSystemMessage(`You joined "${this.currentRoom}" as ${this.username}`);
                this.addSystemMessage('📎 Share this page URL to invite others!');
                break;

            case 'onlineAdd':
                // User joined
                if (data.nick && !this.users.includes(data.nick)) {
                    this.users.push(data.nick);
                    this.updateUserList();
                    this.addSystemMessage(`${data.nick} joined the room`);
                }
                break;

            case 'onlineRemove':
                // User left
                if (data.nick) {
                    this.users = this.users.filter(u => u !== data.nick);
                    this.updateUserList();
                    this.addSystemMessage(`${data.nick} left the room`);
                }
                break;

            case 'chat':
                // Chat message
                this.addMessage({
                    username: data.nick || 'Anonymous',
                    text: data.text || '',
                    timestamp: data.time ? new Date(data.time) : new Date(),
                    trip: data.trip
                }, data.nick === this.username);
                break;

            case 'info':
                // Info message from server
                this.addSystemMessage(data.text || 'Info');
                break;

            case 'warn':
                // Warning from server
                this.addSystemMessage('⚠️ ' + (data.text || 'Warning'));
                break;

            case 'emote':
                // Emote/action
                this.addSystemMessage(`* ${data.nick} ${data.text}`);
                break;

            default:
                console.log('Unknown message:', data);
        }
    }

    updateUserList() {
        const count = this.users.length;
        const text = `${count} user${count !== 1 ? 's' : ''}`;

        if (this.elements.userCount) {
            this.elements.userCount.textContent = text;
        }
        if (this.elements.mobileUsers) {
            this.elements.mobileUsers.textContent = text;
        }

        if (this.elements.onlineUsersList) {
            if (count === 0) {
                this.elements.onlineUsersList.innerHTML = '<div class="no-users">No users online</div>';
            } else {
                this.elements.onlineUsersList.innerHTML = this.users.map(nick => {
                    const isMe = nick === this.username;
                    return `
                        <div class="online-user ${isMe ? 'is-me' : ''}">
                            <span class="online-user-status">●</span>
                            <span class="online-user-name">${this.escapeHtml(nick)}${isMe ? ' (you)' : ''}</span>
                        </div>
                    `;
                }).join('');
            }
        }
    }

    sendMessage() {
        const input = this.elements.messageInput;
        if (!input) return;

        const text = input.value.trim();
        if (!text) return;

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.addSystemMessage('Not connected. Please join a room first.');
            return;
        }

        // Send message (hack.chat protocol)
        this.ws.send(JSON.stringify({
            cmd: 'chat',
            text: text
        }));

        // Clear input
        input.value = '';
        input.style.height = 'auto';

        // Clear reply
        this.replyingTo = null;
        if (this.elements.replyPreview) {
            this.elements.replyPreview.style.display = 'none';
        }
    }

    addMessage(data, isSent) {
        const div = document.createElement('div');
        div.className = `message ${isSent ? 'sent' : 'received'}`;

        div.onclick = (e) => {
            if (e.target.closest('.message-text') || e.target.closest('.message-username')) {
                this.replyToMessage(data);
            }
        };

        const content = document.createElement('div');
        content.className = 'message-content';

        const header = document.createElement('div');
        header.className = 'message-header';

        const username = document.createElement('span');
        username.className = 'message-username';
        username.textContent = data.username;
        if (data.trip) {
            username.title = 'Trip: ' + data.trip;
        }

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

        div.appendChild(content);

        if (this.elements.messages) {
            this.elements.messages.appendChild(div);
            this.scrollToBottom();
        }
    }

    addSystemMessage(text) {
        const div = document.createElement('div');
        div.className = 'system-message';
        div.innerHTML = `<span class="system-icon">ℹ️</span> ${this.escapeHtml(text)}`;

        if (this.elements.messages) {
            this.elements.messages.appendChild(div);
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

        // Add @mention to input
        if (this.elements.messageInput) {
            this.elements.messageInput.value = `@${message.username} `;
            this.elements.messageInput.focus();
        }
    }

    cancelReply() {
        this.replyingTo = null;
        if (this.elements.replyPreview) {
            this.elements.replyPreview.style.display = 'none';
        }
        if (this.elements.messageInput) {
            this.elements.messageInput.value = '';
            this.elements.messageInput.focus();
        }
    }

    changeUsername() {
        const input = this.elements.username;
        let newName = input ? input.value.trim() : '';

        if (!newName) {
            newName = prompt('Enter your new nickname:', this.username);
        }

        if (newName && newName !== this.username) {
            const oldName = this.username;
            this.username = newName;
            localStorage.setItem('chatUsername', this.username);

            if (input) {
                input.value = this.username;
            }

            // Rejoin room with new name
            if (this.currentRoom && this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.close();
                setTimeout(() => this.connect(), 500);
            }

            this.addSystemMessage(`Nickname changed: ${oldName} → ${this.username}`);
        }
    }

    copyShareLink() {
        if (!this.currentRoom) {
            this.addSystemMessage('Join a room first to get a share link');
            return;
        }

        const url = window.location.origin + window.location.pathname + '#' + this.currentRoom;

        navigator.clipboard.writeText(url).then(() => {
            this.addSystemMessage('✅ Link copied!');
        }).catch(() => {
            if (this.elements.shareLink) {
                this.elements.shareLink.select();
                document.execCommand('copy');
                this.addSystemMessage('✅ Link copied!');
            }
        });
    }

    toggleMobileMenu() {
        if (this.elements.sidebar) {
            this.elements.sidebar.classList.toggle('expanded');
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
    console.log('Starting Chat...');
    window.chatApp = new RealtimeChat();
});