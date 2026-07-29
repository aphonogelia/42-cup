import { supabase } from '../supabase.js';

export default async function leaderboardRoutes(fastify) {
  // Public: no auth required to view the leaderboard.
  fastify.get('/api/leaderboard', async (request, reply) => {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .order('words_found', { ascending: false })
      .order('total_time', { ascending: true });

    if (error) return reply.code(500).send({ error: 'Failed to load leaderboard' });
    return data;
  });
}
