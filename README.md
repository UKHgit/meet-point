# Real-time Chat App - Netlify Compatible

A simple, real-time chat application similar to hack.chat that works perfectly with Netlify's free tier using drag-and-drop deployment.

## Quick Start - Drag & Drop to Netlify

1. **Download** this entire folder as a ZIP file
2. **Go to** [Netlify](https://app.netlify.com/drop)
3. **Drag and drop** the ZIP file onto the page
4. **Done!** Your site is live

## Features

- **No registration required** - Just enter a username and start chatting
- **Multiple chat rooms** - Create and join different rooms
- **Real-time messaging** - Polling-based updates for Netlify compatibility
- **Modern dark theme** - Clean, responsive interface
- **Cross-platform** - Works on desktop and mobile devices
- **Netlify Compatible** - Works perfectly with drag-and-drop deployment
- **No database** - Everything runs in memory

## How It Works on Netlify

Since Netlify's free tier doesn't support WebSockets, this app uses:

- **Netlify Functions** - Serverless API endpoints for chat functionality
- **HTTP Polling** - Checks for new messages every 3 seconds
- **Memory Storage** - Messages stored temporarily (resets on function cold starts)

## File Structure

```
web/
├── index.html          # Main HTML page
├── style.css           # Styling for the chat interface
├── script.js           # Client-side JavaScript
├── server.js           # Local WebSocket server (for development)
├── netlify/            # Netlify Functions
│   └── functions/
│       └── chat.js     # Chat API endpoint
├── package.json        # Dependencies
└── README.md          # This file
```

## Local Development

For testing with WebSockets (better performance):

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open your browser and go to:
   ```
   http://localhost:3000
   ```

## Deployment Instructions

### Method 1: Drag & Drop (Easiest)

1. Download this project as a ZIP file
2. Go to [netlify.com/drop](https://app.netlify.com/drop)
3. Drag and drop the ZIP file
4. Your site is live instantly!

### Method 2: Git Repository

1. Push code to GitHub/GitLab/Bitbucket
2. Connect repository to Netlify
3. Deploy automatically on every push

### Method 3: Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Deploy
netlify deploy --prod
```

## Features Overview

### Chat Rooms
- **Default "general" room** - Available immediately
- **Create custom rooms** - Any name you want
- **Switch between rooms** - Easy room navigation
- **Room persistence** - Rooms exist until server restart

### Messaging
- **Real-time updates** - Messages appear instantly (with 3-second polling)
- **User identification** - Custom username support
- **Message history** - Shows last 50 messages
- **System notifications** - Join/leave events, room creation

### User Experience
- **No authentication** - Start chatting immediately
- **Modern interface** - Dark theme, smooth animations
- **Mobile responsive** - Works on phones and tablets
- **Cross-browser compatible** - Works on all modern browsers

## Technical Details

### Frontend
- **Vanilla JavaScript** - No frameworks required
- **Automatic detection** - Detects Netlify vs local deployment
- **Responsive design** - Mobile-first approach
- **Modern CSS** - Custom properties, grid, flexbox

### Backend (Netlify)
- **Serverless Functions** - AWS Lambda via Netlify
- **HTTP API** - RESTful endpoints for chat actions
- **Memory storage** - In-memory message persistence
- **Polling updates** - 3-second interval for new messages

### Backend (Local Development)
- **Node.js WebSocket server** - Full real-time support
- **In-memory storage** - No database required
- **Hot reloading** - Immediate development feedback

## API Endpoints (Netlify Functions)

- `GET /.netlify/functions/chat` - Get room list
- `POST /.netlify/functions/chat` - Send messages, create rooms

## Limitations on Netlify Free Tier

- **No persistent storage** - Messages reset on function cold starts
- **Polling delay** - 3-second maximum message delay
- **Function limits** - Netlify's free tier usage limits apply
- **No true real-time** - Polling-based updates (still feels instant)

## Performance Notes

- **Polling optimization** - Only polls when active
- **Message limits** - Stores only last 50 messages per room
- **Memory efficient** - Minimal resource usage
- **Fast API responses** - Optimized serverless functions

## Customization

### Change Colors
Edit `style.css` to modify the theme:

```css
:root {
  --primary: #4CAF50;    /* Green accent */
  --background: #1a1a1a;  /* Dark background */
  --surface: #2d2d2d;     /* Card background */
  --text: #e0e0e0;       /* Main text color */
}
```

### Add Features
Extend `netlify/functions/chat.js` to add:
- Message reactions
- User avatars
- File uploads
- Private messages

### Branding
Update `index.html` to customize:
- App title and description
- Logo and favicon
- Default room names

## Troubleshooting

### Common Issues

**Messages not appearing?**
- Check browser console for errors
- Wait 3 seconds for polling to fetch new messages
- Try refreshing the page

**Function errors?**
- Netlify functions may need to warm up
- First message might be slow after deployment
- Check Netlify dashboard for function logs

**Drag and drop not working?**
- Ensure you're dropping the entire folder, not individual files
- Check that `netlify/functions/` directory is included
- Try downloading as ZIP then uploading

### Debug Mode

Enable debug mode in browser console:
```javascript
localStorage.setItem('debug', 'true');
```

## Alternatives for True Real-time

If you need true WebSocket functionality:

1. **Upgrade to paid Netlify** - WebSocket support available
2. **Use Pusher** - Third-party WebSocket service
3. **Self-host** - Deploy to VPS with full WebSocket support
4. **Use Heroku** - Free tier supports WebSockets

## Security Notes

- **No authentication** - Anyone can join any room
- **No encryption** - Messages travel over HTTPS but aren't encrypted end-to-end
- **No moderation** - No built-in moderation tools
- **Anonymous by default** - Users can choose any username

## License

MIT License - Feel free to use, modify, and distribute as needed.