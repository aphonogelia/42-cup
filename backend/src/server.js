import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import authPlugin from './plugins/auth-plugin.js';
import authRoutes from './routes/auth.js';
import gameRoutes from './routes/game.js';
import leaderboardRoutes from './routes/leaderboard.js';
import { ensureDailyDraw, getBerlinDateKey, getNextBerlinMidnightDelayMs } from './lib/dailyDraw.js';
import wordResultsRoutes from './routes/wordResults.js';
import statsRoutes from './routes/stats.js';

const fastify = Fastify({ logger: true, trustProxy: true });

await fastify.register(cors, {
  origin: config.frontendUrl,
  credentials: true,
});


console.log('SUPABASE URL:', config.supabase.url);
console.log(
  'SUPABASE PROJECT:',
  config.supabase.url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
);

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

await fastify.register(authPlugin);
await fastify.register(authRoutes);
await fastify.register(gameRoutes);
await fastify.register(leaderboardRoutes);
await fastify.register(wordResultsRoutes);
await fastify.register(statsRoutes);

async function refreshDailyDraw() {
  await ensureDailyDraw({ drawDate: getBerlinDateKey() });
}

function scheduleDailyDrawRefresh() {
  const delay = getNextBerlinMidnightDelayMs();
  const timer = setTimeout(() => {
    refreshDailyDraw()
      .catch((error) => fastify.log.error(error))
      .finally(() => scheduleDailyDrawRefresh());
  }, delay);

  timer.unref();
}

await refreshDailyDraw();
scheduleDailyDrawRefresh();

fastify.get('/api/health', async () => ({ ok: true }));

try {
  await fastify.listen({ port: config.port, host: '0.0.0.0' });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
