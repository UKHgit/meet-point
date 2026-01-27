/**
 * Realtime Chat
 * P2P History Sync & Mobile Optimization
 */

// WebSocket server
const WS_URL = 'wss://hack.chat/chat-ws';

class RealtimeChat {
    constructor() {
        this.ws = null;
        this.username = '';
        this.currentRoom = null;
        this.replyingTo = null;
        this.users = [];
        this.messagesHistory = []; // Store messages for P2P sync
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.pingInterval = null;

        // Mention state
        this.isMentionListVisible = false;
        this.selectedMentionIndex = 0;
        this.mentionTriggerIndex = -1;

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
            'shareLink', 'copyLinkBtn', 'mentionSuggestions'
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
                    if (this.isMentionListVisible) {
                        e.preventDefault();
                        this.selectMention(this.selectedMentionIndex);
                        return;
                    }
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            this.elements.messageInput.addEventListener('keydown', (e) => {
                if (this.isMentionListVisible) {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        this.navigateMentions(e.key === 'ArrowDown' ? 1 : -1);
                    } else if (e.key === 'Escape') {
                        this.hideMentions();
                    } else if (e.key === 'Tab') {
                        e.preventDefault();
                        this.selectMention(this.selectedMentionIndex);
                    }
                }
            });

            this.elements.messageInput.addEventListener('input', () => {
                this.elements.messageInput.style.height = 'auto';
                this.elements.messageInput.style.height = Math.min(this.elements.messageInput.scrollHeight, 120) + 'px';
                this.checkMentions();
            });

            this.elements.messageInput.addEventListener('click', () => this.checkMentions());
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
            // Hide mentions on outside click
            if (this.isMentionListVisible && !e.target.closest('#mentionSuggestions') && !e.target.closest('#messageInput')) {
                this.hideMentions();
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

        // Sanitize room name
        room = room.replace(/^\?/, '');

        // Close existing connection
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.stopPing();

        this.currentRoom = room;
        this.users = [];
        this.messagesHistory = []; // Clear history on room switch
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

        // Connect
        this.connect();
    }

    connect() {
        try {
            this.ws = new WebSocket(WS_URL);

            this.ws.onopen = () => {
                console.log('Connected');
                this.reconnectAttempts = 0;

                // Join room
                this.ws.send(JSON.stringify({
                    cmd: 'join',
                    channel: this.currentRoom,
                    nick: this.username
                }));

                this.startPing();
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
                console.log('Closed');
                this.updateStatus('Disconnected', 'error');
                this.stopPing();

                // Clear user list on disconnect
                this.users = [];
                this.updateUserList();

                // Try to reconnect
                if (this.currentRoom && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    this.addSystemMessage(`Connection lost. Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
                    setTimeout(() => this.connect(), 3000);
                }
            };

            this.ws.onerror = (error) => {
                console.error('Error:', error);
                this.updateStatus('Connection error', 'error');
            };

        } catch (e) {
            console.error('Failed to connect:', e);
            this.updateStatus('Connection failed', 'error');
            this.addSystemMessage('❌ Failed to connect. Please try again.');
        }
    }

    startPing() {
        this.stopPing();
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ cmd: 'ping' }));
            }
        }, 60000); // 60s
    }

    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    // P2P History Sync Methods
    requestHistory() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        // Send hidden command
        this.ws.send(JSON.stringify({
            cmd: 'chat',
            text: '__REQ_HIST__'
        }));
    }

    shareHistory() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (this.messagesHistory.length === 0) return;

        // Share last 20 messages
        const relevantHistory = this.messagesHistory.slice(-20);
        const historyData = JSON.stringify(relevantHistory);

        this.ws.send(JSON.stringify({
            cmd: 'chat',
            text: '__HIST_DATA__:' + historyData
        }));
    }

    loadHistory(jsonString) {
        try {
            const history = JSON.parse(jsonString);
            if (!Array.isArray(history)) return;

            // Filter duplicates roughly
            // Just assume if we have very initially messages, we prepend these.
            // Since we only request on load, we likely have 0 messages or just system messages.

            let addedCount = 0;
            const existingContent = this.messagesHistory.map(m => m.text + m.timestamp);

            history.forEach(msg => {
                // Check if we already have this message (simple heuristic)
                if (!existingContent.includes(msg.text + msg.timestamp)) {
                    // Add to UI
                    this.addMessage(msg, msg.username === this.username, true); // true = isHistory
                    addedCount++;
                }
            });

            if (addedCount > 0) {
                this.addSystemMessage(`Restored ${addedCount} messages from peer history.`);
            }

        } catch (e) {
            console.error('Failed to load history', e);
        }
    }

    handleMessage(data) {
        switch (data.cmd) {
            case 'onlineSet':
                this.users = data.nicks || [];
                this.updateUserList();
                this.updateStatus('Connected', 'connected');
                this.addSystemMessage(`You joined "${this.currentRoom}" as ${this.username}`);
                this.addSystemMessage('📎 Share this page URL to invite others!');

                // Safe to request history now that we are joined
                setTimeout(() => this.requestHistory(), 1000);
                break;

            case 'onlineAdd':
                if (data.nick) {
                    this.users.push(data.nick);
                    this.updateUserList();
                    this.addSystemMessage(`${data.nick} joined`);
                }
                break;

            case 'onlineRemove':
                if (data.nick) {
                    const index = this.users.indexOf(data.nick);
                    if (index > -1) {
                        this.users.splice(index, 1);
                        this.updateUserList();
                        this.addSystemMessage(`${data.nick} left`);
                    }
                }
                break;

            case 'chat':
                // Check for hidden commands
                if (data.text === '__REQ_HIST__') {
                    // Start history sync logic
                    // Only reply if I have history and random chance to avoid storm
                    if (this.messagesHistory.length > 5) {
                        setTimeout(() => this.shareHistory(), Math.random() * 2000 + 500);
                    }
                    return; // Don't show
                }

                if (data.text.startsWith('__HIST_DATA__:')) {
                    this.loadHistory(data.text.substring(14));
                    return; // Don't show
                }

                // Chat message
                this.addMessage({
                    username: data.nick || 'Anonymous',
                    text: data.text || '',
                    timestamp: data.time ? new Date(data.time) : new Date(),
                    trip: data.trip
                }, data.nick === this.username);
                break;

            case 'info':
                this.addSystemMessage(data.text || 'Info');
                break;

            case 'warn':
                this.addSystemMessage('⚠️ ' + (data.text || 'Warning'));
                break;

            case 'emote':
                this.addSystemMessage(`* ${data.nick} ${data.text}`);
                break;

            default:
                console.log('Unknown message:', data);
        }
    }

    // Mention System
    checkMentions() {
        const input = this.elements.messageInput;
        const cursorPos = input.selectionStart;
        const text = input.value;
        const textBeforeCursor = text.substring(0, cursorPos);
        const lastAtPos = textBeforeCursor.lastIndexOf('@');

        if (lastAtPos !== -1) {
            const query = textBeforeCursor.substring(lastAtPos + 1);
            if (!query.includes(' ')) {
                this.showMentions(query, lastAtPos);
                return;
            }
        }

        this.hideMentions();
    }

    showMentions(query, atIndex) {
        if (!this.elements.mentionSuggestions) return;

        const matches = this.users.filter(u =>
            u.toLowerCase().startsWith(query.toLowerCase()) &&
            u !== this.username
        );

        if (matches.length === 0) {
            this.hideMentions();
            return;
        }

        this.elements.mentionSuggestions.innerHTML = matches.map((u, i) => `
            <li class="mention-suggestion ${i === 0 ? 'active' : ''}" data-index="${i}" data-username="${u}">
                <div class="mention-avatar">${u.charAt(0).toUpperCase()}</div>
                <span>${this.escapeHtml(u)}</span>
            </li>
        `).join('');

        this.elements.mentionSuggestions.style.display = 'block';

        this.isMentionListVisible = true;
        this.selectedMentionIndex = 0;
        this.mentionTriggerIndex = atIndex;

        const items = this.elements.mentionSuggestions.querySelectorAll('.mention-suggestion');
        items.forEach(item => {
            item.addEventListener('click', () => {
                this.selectMention(parseInt(item.dataset.index));
            });
            item.addEventListener('mouseover', () => {
                this.selectedMentionIndex = parseInt(item.dataset.index);
                this.updateMentionSelection();
            });
        });
    }

    hideMentions() {
        if (this.elements.mentionSuggestions) {
            this.elements.mentionSuggestions.style.display = 'none';
        }
        this.isMentionListVisible = false;
    }

    navigateMentions(direction) {
        const items = this.elements.mentionSuggestions.querySelectorAll('.mention-suggestion');
        if (items.length === 0) return;

        this.selectedMentionIndex += direction;

        if (this.selectedMentionIndex < 0) this.selectedMentionIndex = items.length - 1;
        if (this.selectedMentionIndex >= items.length) this.selectedMentionIndex = 0;

        this.updateMentionSelection();
    }

    updateMentionSelection() {
        const items = this.elements.mentionSuggestions.querySelectorAll('.mention-suggestion');
        items.forEach((item, i) => {
            if (i === this.selectedMentionIndex) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    }

    selectMention(index) {
        const items = this.elements.mentionSuggestions.querySelectorAll('.mention-suggestion');
        if (index >= 0 && index < items.length) {
            const username = items[index].dataset.username;
            const input = this.elements.messageInput;
            const text = input.value;
            const before = text.substring(0, this.mentionTriggerIndex);
            const after = text.substring(input.selectionStart);

            input.value = `${before}@${username} ${after}`;
            input.focus();

            const newCursorPos = this.mentionTriggerIndex + username.length + 2;
            input.setSelectionRange(newCursorPos, newCursorPos);

            this.hideMentions();
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

        let finalMessage = text;

        if (this.replyingTo) {
            const quote = `> @${this.replyingTo.username}: ${this.replyingTo.text.substring(0, 50)}${this.replyingTo.text.length > 50 ? '...' : ''}\n`;
            finalMessage = quote + text;
        }

        this.ws.send(JSON.stringify({
            cmd: 'chat',
            text: finalMessage
        }));

        input.value = '';
        input.style.height = 'auto';

        this.replyingTo = null;
        if (this.elements.replyPreview) {
            this.elements.replyPreview.style.display = 'none';
        }
    }

    addMessage(data, isSent, isHistory = false) {
        // Store for history sync (only keeping clean text and essential data)
        // Avoid storing duplicates if already there
        if (!isHistory) { // If it's a live message, add to local history
            this.messagesHistory.push({
                username: data.username,
                text: data.text, // Store RAW text including quote info
                timestamp: data.timestamp,
                trip: data.trip
            });
            // Keep history limited to 100 messages
            if (this.messagesHistory.length > 100) {
                this.messagesHistory.shift();
            }
        }

        const div = document.createElement('div');
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        // Add fade-in animation
        div.style.animation = 'fadeIn 0.3s ease-out';

        const content = document.createElement('div');
        content.className = 'message-content';

        // Check for Reply Quote
        let messageText = data.text;

        const replyRegex = /^> @([\w-]+): (.*?)(\n|$)/;
        const match = messageText.match(replyRegex);

        if (match) {
            const replyUser = match[1];
            const replyText = match[2];

            messageText = messageText.substring(match[0].length);

            const replyDiv = document.createElement('div');
            replyDiv.className = 'message-reply';
            replyDiv.innerHTML = `
                <div class="reply-tag">${this.escapeHtml(replyUser)}</div>
                <div class="reply-text">${this.escapeHtml(replyText)}</div>
            `;
            content.appendChild(replyDiv);
        }

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
        time.textContent = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const text = document.createElement('div');
        text.className = 'message-text';

        const escapedText = this.escapeHtml(messageText);
        text.innerHTML = escapedText.replace(/@([\w-]+)/g, (match, name) => {
            if (name === this.username) {
                return `<span class="mention-highlight me">${match}</span>`;
            }
            return `<span class="mention-highlight">${match}</span>`;
        }).replace(/\n/g, '<br>');


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

        div.onclick = (e) => {
            const selection = window.getSelection();
            if (selection.toString().length === 0) {
                this.replyToMessage({
                    username: data.username,
                    text: messageText,
                    timestamp: data.timestamp
                });
            }
        };

        if (this.elements.messages) {
            // Insertion logic: history should be prepended or sorted?
            // Simple logic: If live, append. If history check sort?
            // Since we assume history is older, we could prepend, but user asked to "see early messages"
            // Usually we just append them but they will appear at bottom.
            // P2P restore is async. If we prepend, it might look weird if we already have messages.
            // Better: Auto-scroll behavior.

            this.elements.messages.appendChild(div);

            // Smoother scroll logic for mobile
            if (!isHistory) {
                requestAnimationFrame(() => {
                    this.scrollToBottom();
                });
            } else {
                // For history load, maybe scroll to bottom once at end?
                // But we do it per message here.
                this.scrollToBottom();
            }
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
            // Force layout update for mobile keyboard accuracy
            setTimeout(() => {
                this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
            }, 50); // Small delay for mobile rendering
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
    console.log('Meet Point Initialized');
    window.chatApp = new RealtimeChat();
});