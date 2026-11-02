const API = import.meta.env.VITE_API_URL;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The free-tier backend can take ~30s to wake up, so retry before giving up.
// Everything is logged to the browser console with the prefix [stats].
export async function fetchStats(tries = 6) {
  console.info('[stats] VITE_API_URL =', API);

  if (!API) {
    const msg = 'VITE_API_URL was not set when this build was made. Set it in Vercel and rebuild.';
    console.error('[stats]', msg);
    throw new Error(msg);
  }

  const url = `${API.replace(/\/+$/, '')}/api/public/stats`;

  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url);
      console.info(`[stats] try ${i}/${tries}: GET ${url} -> ${res.status}`);
      if (res.ok) return await res.json();
    } catch (err) {
      console.warn(
        `[stats] try ${i}/${tries}: GET ${url} failed (${err.message}). Network error, or CORS: check the Console for a CORS message.`
      );
    }
    await sleep(3000);
  }

  console.error('[stats] giving up after', tries, 'tries');
  throw new Error('stats unavailable after retries');
}