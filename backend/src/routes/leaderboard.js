import { supabase } from '../supabase.js';
import { getBerlinDateKey } from '../lib/dailyDraw.js';
import {
  getCachedLeaderboard,
  getCachedLeaderboardDates,
  setCachedLeaderboard,
  setCachedLeaderboardDates,
  getCachedWordTimes,
  setCachedWordTimes,
} from '../lib/leaderboardCache.js';

export default async function leaderboardRoutes(fastify) {
  fastify.get('/api/leaderboard', async (request, reply) => {
    const date = request.query.date || getBerlinDateKey();

    const cached = getCachedLeaderboard(date);
    if (cached) {
      return { date, rows: cached };
    }

    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('draw_date', date)
      .order('words_found', { ascending: false })
      .order('total_time', { ascending: true });

    if (error) return reply.code(500).send({ error: 'Failed to load leaderboard' });

    setCachedLeaderboard(date, data ?? []);
    return { date, rows: data };
  });

  fastify.get('/api/leaderboard/dates', async (request, reply) => {
    const cached = getCachedLeaderboardDates();
    if (cached) {
      return cached;
    }

    const { data, error } = await supabase
      .from('words')
      .select('draw_date')
      .order('draw_date', { ascending: false });

    if (error) return reply.code(500).send({ error: 'Failed to load dates' });
    const dates = [...new Set((data ?? []).map((d) => d.draw_date))];

    setCachedLeaderboardDates(dates);
    return dates;
  });

  // Per-word breakdown (times + tries) for one player on one day, for the
  // leaderboard popup. Blocked server-side if the target has privacy on —
  // this is the enforcement point, not just the frontend grey-out.
  fastify.get('/api/leaderboard/word-times', async (request, reply) => {
    const { userId, date } = request.query;
    if (!userId || !date) {
      return reply.code(400).send({ error: 'userId and date required' });
    }
    const cached = getCachedWordTimes(userId, date);

    const [
      { data: targetUser, error: userErr },
      { data: words, error: wordsErr },
    ] = await Promise.all([
      supabase.from('users').select('privacy_enabled').eq('id', userId).maybeSingle(),
      cached ? Promise.resolve({ data: null, error: null }) : supabase
        .from('words')
        .select('id, order_index, length')
        .eq('draw_date', date)
        .order('order_index', { ascending: true }),
    ]);

    if (userErr) return reply.code(500).send({ error: 'Failed to load user' });
    if (!targetUser) return reply.code(404).send({ error: 'User not found' });
    if (targetUser.privacy_enabled) {
      return reply.code(403).send({ error: 'This player has hidden their word times' });
    }
    if (cached) return { userId, date, words: cached };
    if (wordsErr) return reply.code(500).send({ error: 'Failed to load words' });

    
    const wordIds = (words ?? []).map((w) => w.id);
    let results = [];

    if (wordIds.length > 0) {
      const { data, error } = await supabase
        .from('word_results')
        .select('id, word_id, status, nb_tries, time_seconds')
        .eq('user_id', userId)
        .in('word_id', wordIds);

      if (error) return reply.code(500).send({ error: 'Failed to load word times' });
      results = data ?? [];
    }

    const byWordId = Object.fromEntries(results.map((r) => [r.word_id, r]));
    const rows = (words ?? [])
      .map((w) => {
        const r = byWordId[w.id];
        if (!r) return null;
        return {
          word_result_id: r.id,
          word_id: w.id,
          order_index: w.order_index,
          length: w.length,
          status: r.status,
          nb_tries: r.nb_tries,
          time_seconds: r.time_seconds,
        };
      })
      .filter(Boolean);

    setCachedWordTimes(userId, date, rows, date === getBerlinDateKey());
    return { userId, date, words: rows };
  });
}