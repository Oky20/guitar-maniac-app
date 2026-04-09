export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) {}
  }

  const prompt = body?.prompt;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt in request body' });

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const upstream = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: String(prompt) }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || `Gemini API error ${upstream.status}`,
        full_error: data,
      });
    }

    // Convert Gemini response format → Anthropic-compatible format
    // so the frontend doesn't need to change
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const anthropicCompatible = {
      content: [{ type: 'text', text }],
    };

    return res.status(200).json(anthropicCompatible);

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
