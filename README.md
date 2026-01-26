# Real-time Chat App - Vercel Compatible

A simple, real-time chat application similar to hack.chat that works on Vercel's free tier.

## Features

- **No registration required** - Just enter a username and start chatting
- **Multiple chat rooms** - Create and join different rooms
- **Real-time messaging** - Instant message delivery
- **Modern dark theme** - Clean, responsive interface
- **Cross-platform** - Works on desktop and mobile devices
- **Vercel Compatible** - Deploys to Vercel free tier using Server-Sent Events

## Vercel Deployment

This app is specifically designed to work on Vercel's free tier. Since WebSockets are not supported on Vercel's free tier, it uses Server-Sent Events (SSE) as a fallback while maintaining full functionality.

### Quick Deploy to Vercel

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy from project directory**:
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Set up and deploy? → Yes
   - Which scope? → Your account
   - Link to existing project? → No
   - What's your project's name? → realtime-chat (or your choice)
   - In which directory is your code located? → . (current directory)

That's it! Your app will be deployed and you'll get a live URL.

### Manual Vercel Setup

Alternatively, you can:

1. Push your code to GitHub
2. Connect your GitHub account to Vercel
3. Import the project on Vercel
4. Deploy automatically

## Local Development

For local testing with WebSockets (better performance):

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

## Architecture

### Vercel Deployment (Server-Sent Events)
- Uses Server-Sent Events for real-time communication
- Memory-based storage (resets on function cold starts)
- Serverless API endpoints at `/api/sse`
- HTTP POST for sending messages
- HTTP GET with SSE for receiving messages

### Local Development (WebSockets)
- Full WebSocket support for better performance
- Memory-based storage
- Real-time bidirectional communication

## API Endpoints

- `GET /api/sse` - Server-Sent Events stream
- `POST /api/message` - Send a message
- `POST /api/room` - Create a new room
- `GET /api/rooms` - Get list of rooms
- `GET /api/info` - Server info

## Limitations on Vercel Free Tier

- **No message persistence** - Chat history is stored only in memory
- **Cold starts** - Serverless functions may reset connections
- **Connection limits** - Vercel has connection timeout limits
- **No true WebSockets** - Uses SSE fallback (still real-time)

## File Structure

```
web/
├── index.html          # Main HTML page
├── style.css           # Styling for the chat interface
├── script.js           # Client-side JavaScript (WebSocket + SSE)
├── server.js           # Local WebSocket server
├── api/                # Vercel serverless functions
│   ├── index.js       # API routes
│   └── sse.js         # Server-Sent Events implementation
├── vercel.json         # Vercel configuration
├── package.json        # Dependencies and scripts
└── README.md          # This file
```

## Technical Details

### Frontend
- **Vanilla JavaScript** - No frameworks required
- **Automatic detection** - Detects if running on Vercel and switches between WebSocket/SSE
- **Responsive design** - Mobile-friendly interface
- **Modern CSS** - Dark theme with smooth transitions

### Backend (Local)
- **Node.js** with WebSocket (ws library)
- **In-memory storage** - No database required
- **Real-time broadcasting** - Instant message delivery

### Backend (Vercel)
- **Server-Sent Events** - Real-time one-way communication
- **HTTP API** - RESTful endpoints for actions
- **Memory storage** - Limited to 50 recent messages per room

## Customization

### Themes
Edit `style.css` to customize colors and layout.

### Features
Add new functionality by extending the API endpoints and client handlers.

### Branding
Update the HTML title and header text in `index.html`.

## Troubleshooting

### Vercel Deployment Issues
- Make sure all files are committed to your repository
- Check that `vercel.json` is properly configured
- Ensure the `api/` directory structure is correct

### Connection Issues
- Vercel free tier has function duration limits
- Reconnect automatically on connection loss
- Try refreshing the page if messages stop coming through

## Alternatives

For true WebSocket support on serverless, consider:
- **Paid Vercel plan** - Full WebSocket support
- **Pusher** - Third-party WebSocket service
- **Ably** - Alternative real-time messaging service
- **Self-hosted** - Deploy to any VPS with Node.js

## License

MIT License - Feel free to use and modify as needed.