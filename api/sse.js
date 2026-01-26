// Chat API with Server-Sent Events for Vercel
export default function handler(req, res) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Simple response for now
  if (req.method === 'GET') {
    return res.json({
      message: 'Chat SSE endpoint',
      status: 'ready'
    });
  }
  
  if (req.method === 'POST') {
    return res.json({
      success: true,
      message: 'Message received'
    });
  }
  
  res.status(404).json({ error: 'Not found' });
}