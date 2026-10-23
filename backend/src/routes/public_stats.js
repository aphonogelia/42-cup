import { supabase } from '../supabase.js';

const TTL_MS = 60_000;
let cache = null;

export default async function publicStatsRoutes(fastify) {
  fastify.get(
    '/api/public/stats',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

      const { data, error } = await supabase.rpc('public_stats');
      if (error) {
        request.log.error(error);
        return reply.code(500).send({ error: 'Failed to load stats' });
      }

      cache = { at: Date.now(), data };
      return data;
    }
  );
}