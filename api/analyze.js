export const config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
};

async function callGemini(apiKey, prompt, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: String(prompt) }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) {}
  }

  const prompt = body?.prompt;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  // Try primary model, fallback to lite if 503
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
  let lastError = null;

  for (const model of models) {
    try {
      const { ok, status, data } = await callGemini(apiKey, prompt, model);

      if (ok) {
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return res.status(200).json({ content: [{ type: 'text', text }] });
      }

      // 503 or 429 = overloaded, try next model
      if (status === 503 || status === 429) {
        lastError = `${model} unavailable (${status}), trying fallback...`;
        continue;
      }

      // Other errors (400, 404) = stop and return
      return res.status(status).json({
        error: data?.error?.message || `Gemini API error ${status}`,
        model_tried: model,
      });

    } catch (err) {
      lastError = err.message;
      continue;
    }
  }

  // All models failed
  return res.status(503).json({
    error: 'Gemini API sedang overloaded. Coba lagi dalam beberapa detik.',
    detail: lastError,
  });
}
