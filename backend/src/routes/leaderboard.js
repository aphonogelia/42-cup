import { supabase } from '../supabase.js';
import { getBerlinDateKey } from '../lib/dailyDraw.js';

export default async function leaderboardRoutes(fastify) {
  fastify.get('/api/leaderboard', async (request, reply) => {
    const date = request.query.date || getBerlinDateKey();

    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('draw_date', date)
      .order('words_found', { ascending: false })
      .order('total_time', { ascending: true });

    if (error) return reply.code(500).send({ error: 'Failed to load leaderboard' });
    return { date, rows: data };
  });

  fastify.get('/api/leaderboard/dates', async (request, reply) => {
    const { data, error } = await supabase
      .from('words')
      .select('draw_date')
      .order('draw_date', { ascending: false });

    if (error) return reply.code(500).send({ error: 'Failed to load dates' });
    const dates = [...new Set((data ?? []).map((d) => d.draw_date))];
    return dates;
  });
}