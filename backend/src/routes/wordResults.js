import { supabase } from '../supabase.js';
import { getBerlinDateKey, ensureDailyDraw } from '../lib/dailyDraw.js';
import { getCachedGuesses, setCachedGuesses } from '../lib/leaderboardCache.js';

// Same bar as the share button: only someone who has finished every word
// today is allowed to see anyone's guesses for today (guesses leak letter
// info via feedback). Past days are locked/unplayable, so they're open.
async function hasCompletedToday(userId, drawDate) {
  const words = await ensureDailyDraw({ drawDate });
  const wordIds = words.map((w) => w.id);
  if (wordIds.length === 0) return false;

  const { data, error } = await supabase
    .from('word_results')
    .select('word_id, status')
    .eq('user_id', userId)
    .in('word_id', wordIds)
    .in('status', ['solved', 'failed']);

  if (error) throw error;
  return new Set((data ?? []).map((r) => r.word_id)).size >= wordIds.length;
}

export default async function wordResultsRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  fastify.get('/api/word-results/:id/guesses', async (request, reply) => {
    const { id } = request.params;

    const { data: wordResult, error: wrErr } = await supabase
      .from('word_results')
      .select('id, status, word_id')
      .eq('id', id)
      .maybeSingle();

    if (wrErr) return reply.code(500).send({ error: 'Failed to load word result' });
    if (!wordResult) return reply.code(404).send({ error: 'Not found' });

    const { data: word, error: wordErr } = await supabase
      .from('words')
      .select('draw_date')
      .eq('id', wordResult.word_id)
      .maybeSingle();

    if (wordErr || !word) return reply.code(500).send({ error: 'Failed to load word' });

    const today = getBerlinDateKey();
    if (word.draw_date === today) {
      let allowed = false;
      try {
        allowed = await hasCompletedToday(request.user.id, today);
      } catch (error) {
        fastify.log.error(error, 'Failed to verify completion status');
        return reply.code(500).send({ error: 'Failed to verify access' });
      }
      if (!allowed) {
        return reply.code(403).send({ error: "Finish today's words to view guesses" });
      }
    }

    const cacheable = wordResult.status === 'solved' || wordResult.status === 'failed';
    if (cacheable) {
      const cached = getCachedGuesses(id);
      if (cached) return { guesses: cached };
    }

    const { data: guesses, error } = await supabase
      .from('guesses')
      .select('guess, feedback, created_at')
      .eq('word_result_id', id)
      .order('created_at', { ascending: true });

    if (error) return reply.code(500).send({ error: 'Failed to load guesses' });

    if (cacheable) setCachedGuesses(id, guesses ?? []);

    return { guesses: guesses ?? [] };
  });
}