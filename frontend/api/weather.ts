import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Разрешаем только POST запросы
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const key = process.env.VITE_YANDEX_WEATHER_KEY;

  if (!key) {
    return res.status(500).json({ error: 'API key not configured on Vercel' });
  }

  try {
    const response = await fetch('https://api.weather.yandex.ru/graphql/query', {
      method: 'POST',
      headers: {
        'X-Yandex-Weather-Key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Failed to fetch from Yandex' });
  }
}
