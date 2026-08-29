import { supabase } from '../supabase.js';
import { getBerlinDateKey } from '../lib/dailyDraw.js';
import { computeStats, computeRankCounts } from '../lib/stats.js';

export default async function statsRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  fastify.get('/api/stats/me', async (request, reply) => {
    const [
      { data: dateRows, error: datesErr },
      { data: results, error: resultsErr },
      { data: leaderboardRows, error: lbErr },
    ] = await Promise.all([
      supabase.from('words').select('draw_date').order('draw_date', { ascending: true }),
      supabase
        .from('word_results')
        .select('status, nb_tries, time_seconds, words(draw_date, order_index)')
        .eq('user_id', request.user.id),
      supabase.from('leaderboard').select('user_id, draw_date, words_found, total_time'),
    ]);

    if (datesErr) return reply.code(500).send({ error: 'Failed to load draw dates' });
    if (resultsErr) return reply.code(500).send({ error: 'Failed to load results' });
    if (lbErr) return reply.code(500).send({ error: 'Failed to load leaderboard' });

    const countsMap = new Map();
    for (const row of dateRows) {
      countsMap.set(row.draw_date, (countsMap.get(row.draw_date) ?? 0) + 1);
    }
    const dateCounts = [...countsMap.entries()]
      .map(([draw_date, total]) => ({ draw_date, total }))
      .sort((a, b) => a.draw_date.localeCompare(b.draw_date));

    const flatResults = results.map((r) => ({
      status: r.status,
      nb_tries: r.nb_tries,
      time_seconds: r.time_seconds,
      draw_date: r.words.draw_date,
      order_index: r.words.order_index,
    }));

    const stats = computeStats(flatResults, dateCounts, getBerlinDateKey());
    const rankCounts = computeRankCounts(leaderboardRows, request.user.id);

    return { ...stats, ...rankCounts };
  });
}