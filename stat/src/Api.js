const API = import.meta.env.VITE_API_URL;
const STATS_URL = new URL('/api/public/stats', API);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The free-tier backend can take ~30s to wake up, so retry before giving up.
export async function fetchStats(tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(STATS_URL);
      if (res.ok) return await res.json();
    } catch {
      // cold start or network error: retry
    }
    await sleep(3000);
  }
  throw new Error('stats unavailable');
}