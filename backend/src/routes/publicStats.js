import { supabase } from '../supabase.js';

// The numbers are rebuilt once a night by the DB (refresh_stats, pg_cron), so this
// route only reads the cached rows. A short in-memory cache spares the DB.
const TTL_MS = 5 * 60_000;
let cache = null;

export default async function publicStatsRoutes(fastify) {
  fastify.get(
    '/api/public/stats',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

      const { data, error } = await supabase
        .from('stats_cache')
        .select('key, payload, updated_at');

      if (error) {
        request.log.error(error);
        return reply.code(500).send({ error: 'Failed to load stats' });
      }

      // { updatedAt, overview: {...}, <later sections> }
      const out = { updatedAt: null };
      for (const row of data ?? []) {
        out[row.key] = row.payload;
        if (!out.updatedAt || row.updated_at > out.updatedAt) out.updatedAt = row.updated_at;
      }

      cache = { at: Date.now(), data: out };
      return out;
    }
  );
}