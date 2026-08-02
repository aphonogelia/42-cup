import { supabase } from '../supabase.js';
import { computeFeedback, isWin } from '../lib/wordel.js';
import { isAllowedGuess } from '../lib/dictionary.js';
import { validateHardMode } from '../lib/hardMode.js';
import { config } from '../config.js';
import { ensureDailyDraw, getBerlinDateKey } from '../lib/dailyDraw.js';
import { invalidateLeaderboard } from '../lib/leaderboardCache.js';


function elapsed(started) {
  return Math.round(performance.now() - started);
}

let dailyWordsCache = null;
let dailyWordsCacheDate = null;

async function getOrCreateWordResult(fastify, userId, wordId) {
  const started = performance.now();

  const { data: existing } = await supabase
    .from('word_results')
    .select('*, guesses(guess, feedback, created_at)')
    .eq('user_id', userId)
    .eq('word_id', wordId)
    .order('created_at', { referencedTable: 'guesses' })
    .maybeSingle();

  fastify.log.info(
    { ms: Math.round(performance.now() - started) },
    'word result lookup'
  );

  if (existing) return existing;

  const insertStarted = performance.now();

  const { data: created, error } = await supabase
    .from('word_results')
    .insert({ user_id: userId, word_id: wordId, status: 'in_progress' })
    .select()
    .single();

  fastify.log.info(
    { ms: Math.round(performance.now() - insertStarted) },
    'word result insert'
  );

  if (error) throw error;
  return { ...created, guesses: [] };
}

export default async function gameRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  async function getActiveDraw() {
    const drawDate = getBerlinDateKey();

    if (dailyWordsCacheDate === drawDate && dailyWordsCache) {
      return { drawDate, words: dailyWordsCache };
    }

    const words = await ensureDailyDraw({ drawDate });

    dailyWordsCache = words;
    dailyWordsCacheDate = drawDate;

    return { drawDate, words };
  }

  // Returns the ordered word list (metadata only, never the answer) plus
  // this user's progress on each, so the frontend can render a map/list.
  fastify.get('/api/game/progress', async (request, reply) => {
    let words;
    try {
      ({ words } = await getActiveDraw());
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to load words' });
    }

    const { data: results, error: resErr } = await supabase
      .from('word_results')
      .select('word_id, status, nb_tries, time_seconds, started_at')
      .eq('user_id', request.user.id);
    if (resErr) return reply.code(500).send({ error: 'Failed to load progress' });

    const byWordId = Object.fromEntries(results.map((r) => [r.word_id, r]));
    return words.map((w) => ({
      word_id: w.id,
      order_index: w.order_index,
      length: w.length,
      status: byWordId[w.id]?.status ?? 'not_started',
      nb_tries: byWordId[w.id]?.nb_tries ?? 0,
      time_seconds: byWordId[w.id]?.time_seconds ?? null,
      started_at: byWordId[w.id]?.started_at ?? null,
    }));
  });

  // Starts (or resumes) a specific word by its order_index (1..5).
  // Server stamps started_at the first time this is called for a word.
  fastify.post('/api/game/start', async (request, reply) => {
    const { order_index } = request.body ?? {};
    if (!order_index) return reply.code(400).send({ error: 'order_index required' });

    const drawDate = getBerlinDateKey();
    const { data: word, error: wordErr } = await supabase
      .from('words')
      .select('id, order_index, length, draw_date')
      .eq('draw_date', drawDate)
      .eq('order_index', order_index)
      .single();

    let currentWord = word;

    if (wordErr || !word) {
      try {
        const words = await ensureDailyDraw({ drawDate });
        currentWord = words.find((item) => item.order_index === order_index);
        if (!currentWord) return reply.code(404).send({ error: 'Word not found' });
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to load daily draw' });
      }
    }

    const result = await getOrCreateWordResult(fastify, request.user.id, currentWord.id);

    return {
      word_id: currentWord.id,
      length: currentWord.length,
      nb_tries: result.nb_tries,
      max_tries: config.game.maxTries,
      status: result.status,
      started_at: result.started_at,
      guesses: result.guesses ?? [],
    };
  });

  // Submits a guess for the word currently in progress.
  fastify.post('/api/game/guess', async (request, reply) => {
    const requestStarted = performance.now();
    const { word_id, guess } = request.body ?? {};
    if (!word_id || !guess) return reply.code(400).send({ error: 'word_id and guess required' });

    const { words } = await getActiveDraw();

    const word = words.find((item) => item.id === word_id);

    if (!word) {
      return reply.code(404).send({ error: 'Word not found' });
    }

    if (guess.length !== word.length) {
      return reply.code(400).send({ error: `Guess must be ${word.length} letters` });
    }
    if (!isAllowedGuess(guess)) {
      return reply.code(400).send({ error: 'Not a recognized word' });
    }

    const result = await getOrCreateWordResult(fastify, request.user.id, word.id);
    if (result.status !== 'in_progress') {
      return reply.code(409).send({
        error: `Word already ${result.status}`,
        status: result.status
      });
    }

    if (config.game.hardMode) {

      const check = validateHardMode(
        guess.toLowerCase(),
        result.guesses ?? []
      );

      if (!check.valid) {
        return reply.code(400).send({ error: check.error });
      }
    }


    const feedback = computeFeedback(guess, word.answer);
    const win = isWin(feedback);
    const nbTries = result.nb_tries + 1;
    const outOfTries = !win && nbTries >= config.game.maxTries;

    const update = { nb_tries: nbTries };
    if (win) {
      update.status = 'solved';
      update.solved_at = new Date().toISOString();
    } else if (outOfTries) {
      update.status = 'failed';
      update.solved_at = new Date().toISOString(); // stamp end time even on failure, for consistency
    }

    const saveStarted = performance.now();
    const [{ error: insertErr }, { data: updated, error: updateErr }] = await Promise.all([
      supabase.from('guesses').insert({
        word_result_id: result.id,
        guess: guess.toLowerCase(),
        feedback,
      }),
      supabase
        .from('word_results')
        .update(update)
        .eq('id', result.id)
        .select()
        .single(),
    ]);

    fastify.log.info(
      { ms: Math.round(performance.now() - saveStarted) },
      'save guess'
    );
    if (insertErr || updateErr) return reply.code(500).send({ error: 'Failed to save guess' });

    invalidateLeaderboard(getBerlinDateKey());


    fastify.log.info(
      { ms: Math.round(performance.now() - requestStarted) },
      'guess request'
    );

    return {
      feedback,
      nb_tries: updated.nb_tries,
      status: updated.status,
      time_seconds: updated.time_seconds,
      answer: updated.status !== 'in_progress' ? word.answer : undefined,
    };
  });
}
