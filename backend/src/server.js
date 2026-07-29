import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import gameRoutes from './routes/game.js';
import leaderboardRoutes from './routes/leaderboard.js';

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: config.frontendUrl,
  credentials: true, // required so the session cookie is sent/accepted cross-origin
});

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

await fastify.register(authPlugin);
await fastify.register(authRoutes);
await fastify.register(gameRoutes);
await fastify.register(leaderboardRoutes);

fastify.get('/api/health', async () => ({ ok: true }));

try {
  await fastify.listen({ port: config.port, host: '0.0.0.0' });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
