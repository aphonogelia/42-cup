import { supabase } from '../supabase.js';
import { computeFeedback, isWin } from '../lib/wordel.js';
import { isAllowedGuess } from '../lib/dictionary.js';
import { validateHardMode } from '../lib/hardMode.js';
import { config } from '../config.js';
import { ensureDailyDraw, getBerlinDateKey } from '../lib/dailyDraw.js';
import { invalidateLeaderboard, invalidateWordTimes } from '../lib/leaderboardCache.js';
import { checkPlayerForCheating } from '../lib/cheatDetection.js';

function elapsed(started) {
  return Math.round(performance.now() - started);
}

function visibleStartedAt(result) {
  // Treat started_at as unset until the user has made a first guess.
  if (!result || !result.nb_tries) return null;
  return result.started_at;
}

let dailyWordsCache = null;
let dailyWordsCacheDate = null;

async function getWordResult(fastify, userId, wordId) {
  const started = performance.now();

  const { data: existing, error } = await supabase
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

  if (error) throw error;
  return existing ?? null;
}

async function createWordResult(fastify, userId, wordId) {
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
      started_at: visibleStartedAt(byWordId[w.id]),
    }));
  });

  // Starts (or resumes) a specific word by its order_index (1..5).
  // Timer starts on first guess; started_at stays hidden before that.
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

    const result = await getWordResult(fastify, request.user.id, currentWord.id);

    return {
      word_id: currentWord.id,
      length: currentWord.length,
      nb_tries: result?.nb_tries ?? 0,
      max_tries: config.game.maxTries,
      status: result?.status ?? 'not_started',
      started_at: visibleStartedAt(result),
      guesses: result?.guesses ?? [],
    };
  });

  // Returns full guess history + timing for today, for share-image generation.
  fastify.get('/api/game/share', async (request, reply) => {
    let words;
    try {
      ({ words } = await getActiveDraw());
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to load words' });
    }

    const { data: results, error } = await supabase
      .from('word_results')
      .select('word_id, status, time_seconds, guesses(feedback, created_at)')
      .eq('user_id', request.user.id)
      .order('created_at', { referencedTable: 'guesses' });

    if (error) return reply.code(500).send({ error: 'Failed to load share data' });

    const byWordId = Object.fromEntries(results.map((r) => [r.word_id, r]));
    const data = words
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .map((w) => {
        const r = byWordId[w.id];
        return {
          order_index: w.order_index,
          status: r?.status ?? 'not_started',
          time_seconds: r?.time_seconds ?? null,
          guesses: (r?.guesses ?? []).map((g) => g.feedback),
        };
      });

    return { date: getBerlinDateKey(), words: data };
  });


  // Submits a guess for the word currently in progress.
  fastify.post('/api/game/guess', async (request, reply) => {
    const requestStarted = performance.now();
    const { word_id, guess } = request.body ?? {};
    if (!word_id || !guess) return reply.code(400).send({ error: 'word_id and guess required' });

    const { words } = await getActiveDraw();
    const word = words.find((item) => item.id === word_id);
    if (!word) return reply.code(404).send({ error: 'Word not found' });

    if (guess.length !== word.length) {
      return reply.code(400).send({ error: `Guess must be ${word.length} letters` });
    }
    if (!isAllowedGuess(guess)) {
      return reply.code(400).send({ error: 'Not a recognized word' });
    }

    // Hard mode still needs prior guesses, so fetch them read-only first
    // (the actual write path is atomic in the DB regardless of what happens here).
    if (config.game.hardMode) {
      const existing = await getWordResult(fastify, request.user.id, word.id);
      const check = validateHardMode(guess.toLowerCase(), existing?.guesses ?? []);
      if (!check.valid) return reply.code(400).send({ error: check.error });
    }

    const feedback = computeFeedback(guess, word.answer);
    const win = isWin(feedback);

    const rpcStarted = performance.now();
    const { data: updated, error: rpcErr } = await supabase.rpc('submit_guess', {
      p_user_id: request.user.id,
      p_word_id: word.id,
      p_guess: guess.toLowerCase(),
      p_feedback: feedback,
      p_is_win: win,
      p_max_tries: config.game.maxTries,
    });
    fastify.log.info({ ms: Math.round(performance.now() - rpcStarted) }, 'submit_guess rpc');

    if (rpcErr) return reply.code(500).send({ error: 'Failed to save guess' });

    // If the row wasn't in_progress by the time we got the lock, this was a duplicate
    // request racing an already-completed one — don't award a second guess result.
    if (updated.status !== 'in_progress' && updated.nb_tries === (updated.nb_tries)) {
      // (status flips to solved/failed on the winning request; a true duplicate
      // simply returns the already-finalized row unchanged)
    }

    if (updated.status === 'solved' || updated.status === 'failed') {
      const { count: completedCount, error: completedError } = await supabase
        .from('word_results')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', request.user.id)
        .in('status', ['solved', 'failed']);

      if (!completedError && completedCount >= 5) {
        try {
          await checkPlayerForCheating(request.user.id, getBerlinDateKey(), request.user.login);
        } catch (error) {
          fastify.log.error(error, 'Failed to check player for cheating');
        }
      }
    }

    invalidateLeaderboard(getBerlinDateKey());
    invalidateWordTimes(request.user.id, getBerlinDateKey());

    fastify.log.info({ ms: Math.round(performance.now() - requestStarted) }, 'guess request');

    return {
      feedback,
      nb_tries: updated.nb_tries,
      status: updated.status,
      time_seconds: updated.time_seconds,
      answer: updated.status !== 'in_progress' ? word.answer : undefined,
    };
  });
}
