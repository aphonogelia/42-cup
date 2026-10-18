export default async function avatarProbe(fastify) {
  fastify.get('/api/_probe', async () => {
    const u = 'https://cdn.intra.42.fr/users/00f3c88e542c8ee01e2d0a0a2fc36c92/htharrau.jpg';
    const browserHeaders = {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
    };
    const out = {};
    for (const [name, headers] of [['plain', {}], ['browser', browserHeaders]]) {
      try {
        const r = await fetch(u, { headers });
        out[name] = { status: r.status, type: r.headers.get('content-type') };
      } catch (e) {
        out[name] = { error: String(e) };
      }
    }
    return out;
  });
}