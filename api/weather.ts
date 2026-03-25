import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Используем ключ БЕЗ префикса VITE, так как это серверная часть
  const key = process.env.YANDEX_WEATHER_KEY;

  if (!key) {
    return res.status(500).json({ error: 'YANDEX_WEATHER_KEY is missing in Vercel settings' });
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
    return res.status(500).json({ error: 'Failed to proxy request' });
  }
}
