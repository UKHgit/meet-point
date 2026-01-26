// Vercel serverless function for API routes
// This handles the main API endpoints

module.exports = (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Basic API info endpoint
  if (req.url === '/api/info' && req.method === 'GET') {
    return res.json({
      status: 'active',
      version: '1.0.0',
      websocket: process.env.VERCEL_URL ? `wss://${process.env.VERCEL_URL}` : 'ws://localhost:3000'
    });
  }
  
  res.status(404).json({ error: 'Not found' });
};