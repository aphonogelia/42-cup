import { supabase } from '../supabase.js';
import { getBerlinDateKey } from '../lib/dailyDraw.js';
import { computeStats } from '../lib/stats.js';

// PostgREST silently caps every response at 1000 rows. Page through instead.
async function fetchAll(buildQuery, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

export default async function statsRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  fastify.get('/api/stats/me', async (request, reply) => {
    const isGuest = request.user.guest;
    const userId = request.user.id;

    try {
      const [dateRows, results, rankRes] = await Promise.all([
        fetchAll(() =>
          supabase.from('words').select('draw_date').order('draw_date', { ascending: true }).order('id')
        ),
        // valid_results: same eligibility as the leaderboards (not flagged, unfinished past words = failed).
        fetchAll(() =>
          supabase
            .from('valid_results')
            .select('word_result_id, status, nb_tries, time_seconds, draw_date, order_index, answer')
            .eq('user_id', userId)
            .order('word_result_id')
        ),
        isGuest
          ? Promise.resolve({ data: null, error: null })
          : supabase.rpc('user_rank_counts', { p_user_id: userId }),
      ]);

      if (rankRes.error) throw rankRes.error;

      const countsMap = new Map();
      for (const row of dateRows) {
        countsMap.set(row.draw_date, (countsMap.get(row.draw_date) ?? 0) + 1);
      }
      const dateCounts = [...countsMap.entries()]
        .map(([draw_date, total]) => ({ draw_date, total }))
        .sort((a, b) => a.draw_date.localeCompare(b.draw_date));

      const stats = computeStats(results, dateCounts, getBerlinDateKey());

      const rank = rankRes.data?.[0];
      const rankCounts = rank ? { top1: rank.top1, top3: rank.top3, top5: rank.top5 } : {};

      return { ...stats, ...rankCounts };
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to load stats' });
    }
  });
}