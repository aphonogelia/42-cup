import { supabase } from '../supabase.js';
import { getBerlinDateKey } from '../lib/dailyDraw.js';
import {
  getCachedLeaderboard,
  getCachedLeaderboardDates,
  setCachedLeaderboard,
  setCachedLeaderboardDates,
  getCachedWordTimes,
  setCachedWordTimes,
  getCachedGuesses,
  setCachedGuesses,
  getScopeEpoch,
  loadPeriod,
} from '../lib/leaderboardCache.js';
import { LEADERBOARD_RULES } from '../lib/leaderboardConfig.js';
import { toOpenDailyRow, projectPeriodRows, toOpenWordTimesRows } from '../lib/openRows.js';
import { installSchemaErrors } from '../lib/schemaErrors.js';
import { hasCompletedToday } from './wordResults.js';



const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

// `global` already means all-time in this codebase, so the new axis is `scope`:
// 42 = 42 players only, open = opt-in, handle-based, guests included.
const SCOPE_SCHEMA = { type: 'string', enum: ['42', 'open'], default: '42' };
const DATE_SCHEMA = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };

export const DAILY_BOARD_SCHEMA = {
  querystring: {
    type: 'object',
    properties: { scope: SCOPE_SCHEMA, date: DATE_SCHEMA },
  },
};

export const MONTHLY_BOARD_SCHEMA = {
  querystring: {
    type: 'object',
    properties: {
      scope: SCOPE_SCHEMA,
      month: { type: 'string', pattern: MONTH_RE.source },
    },
  },
};

export const GLOBAL_BOARD_SCHEMA = {
  querystring: {
    type: 'object',
    properties: { scope: SCOPE_SCHEMA },
  },
};

export const WORD_TIMES_SCHEMA = {
  querystring: {
    type: 'object',
    required: ['date'],
    properties: {
      scope: SCOPE_SCHEMA,
      date: DATE_SCHEMA,
      userId: { type: 'string', minLength: 1, maxLength: 64 },
      handle: { type: 'string', maxLength: 64 },
    },
  },
};

export const WORD_GUESSES_SCHEMA = {
  querystring: {
    type: 'object',
    required: ['scope', 'handle', 'date', 'order'],
    properties: {
      scope: { type: 'string', enum: ['open'] },
      handle: { type: 'string', maxLength: 64 },
      date: DATE_SCHEMA,
      order: { type: 'integer', minimum: 1 },
    },
  },
};

// The scope is per request, so it cannot be a route-level preHandler: this
// returns the same 403 body as fastify.requireRealUser.
function allowScope(scope, request, reply) {
  if (scope === '42' && request.user?.guest) {
    reply.code(403).send({ error: 'login_required' });
    return false;
  }
  return true;
}

function lastDayOfMonth(year, month1to12) {
  // day 0 of the next month = last day of this one
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

// Thresholds returned to the frontend (and used for the RPC) per board.
// longevityDays = number of days of the month when known (monthly board),
// null in /meta where no month is selected ("every day of the month").
function monthlyThresholds(daysInMonth = null) {
  return {
    minDays: LEADERBOARD_RULES.monthlyMinDays,
    tryPenaltySeconds: LEADERBOARD_RULES.tryPenaltySeconds,
    failWeight: LEADERBOARD_RULES.failPenaltyWeight,
    longevityMax: LEADERBOARD_RULES.longevityMax,
    longevityDays: daysInMonth,
  };
}

function globalThresholds() {
  return {
    minDays: LEADERBOARD_RULES.globalMinDays,
    tryPenaltySeconds: LEADERBOARD_RULES.tryPenaltySeconds,
    failWeight: LEADERBOARD_RULES.failPenaltyWeight,
    longevityMax: LEADERBOARD_RULES.longevityMax,
    longevityDays: LEADERBOARD_RULES.allTimeLongevityDays,
  };
}

// Qualified players first, then by score asc (lower = better), then median time
// asc, then more complete days. Unqualified players keep their data but get no
// rank, so the UI can show them under "not ranked yet" with their progress.
function rankRows(rows) {
  const num = (v) => (v === null || v === undefined ? Infinity : Number(v));
  const isRanked = (r) => Boolean(r.qualified) && r.score !== null && r.score !== undefined;

  const sorted = rows.slice().sort((a, b) => {
    const ra = isRanked(a);
    const rb = isRanked(b);
    if (ra !== rb) return ra ? -1 : 1;
    if (num(a.score) !== num(b.score)) return num(a.score) - num(b.score);
    if (num(a.median_time) !== num(b.median_time)) return num(a.median_time) - num(b.median_time);
    return b.days_complete - a.days_complete;
  });

  let rank = 0;
  return sorted.map((r) => ({ ...r, rank: isRanked(r) ? ++rank : null }));
}

async function fetchPeriodRows(params) {
  const { data, error } = await supabase.rpc('leaderboard_period', params);
  if (error) throw error;
  return rankRows(data ?? []);
}

// Distinct draw dates, newest first (cached). Shared by /dates and /meta.
async function loadDates() {
  const cached = getCachedLeaderboardDates();
  if (cached) return cached;

  const { data, error } = await supabase
    .from('words')
    .select('draw_date')
    .order('draw_date', { ascending: false });

  if (error) throw error;
  const dates = [...new Set((data ?? []).map((d) => d.draw_date))];

  setCachedLeaderboardDates(dates);
  return dates;
}

// Per-word breakdown for the leaderboard popup. Privacy is enforced here, not in
// the UI, and the open mode carries no id at all, so a handle cannot be matched
// to a login. `db` is injectable for tests.
export function makeWordTimesHandler(db = supabase) {
  return async function wordTimesHandler(request, reply) {
    const scope = request.query.scope;
    if (!allowScope(scope, request, reply)) return;

    const date = request.query.date;

    let target;

    if (scope === '42') {
      const { userId } = request.query;
      if (!userId) return reply.code(400).send({ error: 'userId and date required' });

      const { data, error } = await db
        .from('users')
        .select('id, privacy_enabled')
        .eq('id', userId)
        .maybeSingle();

      if (error) return reply.code(500).send({ error: 'Failed to load user' });
      target = data;
    } else {
      const handle = typeof request.query.handle === 'string' ? request.query.handle : '';
      if (!handle) return reply.code(400).send({ error: 'handle and date required' });

      // The same filter as the open board: a handle is only reachable if its
      // owner is opted in. A user who left the board is indistinguishable from
      // a handle that never existed.
      const { data, error } = await db
        .from('users')
        .select('id, handle, privacy_enabled')
        .eq('handle', handle)
        .eq('global_opt_in', true)
        .maybeSingle();

      if (error) return reply.code(500).send({ error: 'Failed to load user' });
      target = data;
    }

    // Same body for "no such handle" and "not on the open board": the 404 must
    // not work as a handle-exists oracle.
    if (!target) return reply.code(404).send({ error: 'User not found' });
    if (target.privacy_enabled) {
      return reply.code(403).send({ error: 'This player has hidden their word times' });
    }

    const cached = getCachedWordTimes(target.id, date);
    if (cached) return wordTimesPayload(scope, target, date, cached);

    const { data: words, error: wordsErr } = await db
      .from('words')
      .select('id, order_index, length')
      .eq('draw_date', date)
      .order('order_index', { ascending: true });

    if (wordsErr) return reply.code(500).send({ error: 'Failed to load words' });

    const wordIds = (words ?? []).map((w) => w.id);
    let results = [];

    if (wordIds.length > 0) {
      const { data, error } = await db
        .from('word_results')
        .select('id, word_id, status, nb_tries, time_seconds')
        .eq('user_id', target.id)
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

    setCachedWordTimes(target.id, date, rows, date === getBerlinDateKey());
    return wordTimesPayload(scope, target, date, rows);
  };
}

// The open payload has no id of any kind. word_result_id is the same value in
// both scopes, so returning it would let a real user match a handle to a login.
function wordTimesPayload(scope, target, date, rows) {
  if (scope === 'open') {
    return { handle: target.handle, date, words: toOpenWordTimesRows(rows) };
  }
  return { userId: target.id, date, words: rows };
}

// Guess history for one open word (handle + date + order_index). No id ever
// leaves the server, so a handle cannot be matched to a login; `db` and
// `hasCompleted` are injectable for tests.
export function makeWordGuessesHandler({ db = supabase, hasCompleted = hasCompletedToday } = {}) {
  return async function wordGuessesHandler(request, reply) {
    const { date, handle, order: orderIndex } = request.query;

    // Same filter as the board: only opted-in, handled users are reachable, so
    // an unknown handle and a non-listed user are the same 404.
    const { data: target, error: userError } = await db
      .from('users')
      .select('id, handle, privacy_enabled')
      .eq('handle', handle)
      .eq('global_opt_in', true)
      .maybeSingle();

    if (userError) return reply.code(500).send({ error: 'Failed to load user' });
    if (!target) return reply.code(404).send({ error: 'User not found' });

    // Privacy first: it must not reveal whether that position exists.
    if (target.privacy_enabled) {
      return reply.code(403).send({ error: 'This player has hidden their guesses' });
    }

    const { data: word, error: wordError } = await db
      .from('words')
      .select('id, draw_date')
      .eq('draw_date', date)
      .eq('order_index', orderIndex)
      .maybeSingle();

    if (wordError) return reply.code(500).send({ error: 'Failed to load word' });
    if (!word) return reply.code(404).send({ error: 'Not found' });

    const { data: result, error: resultError } = await db
      .from('word_results')
      .select('id, status')
      .eq('user_id', target.id)
      .eq('word_id', word.id)
      .maybeSingle();

    if (resultError) return reply.code(500).send({ error: 'Failed to load word result' });
    if (!result) return reply.code(404).send({ error: 'Not found' });

    // Today's guesses stay hidden until the viewer has finished today's words.
    if (word.draw_date === getBerlinDateKey()) {
      try {
        const allowed = await hasCompleted(request.user.id, word.draw_date);
        if (!allowed) return reply.code(403).send({ error: "Finish today's words to view guesses" });
      } catch (err) {
        request.log.error(err, 'Failed to verify completion status');
        return reply.code(500).send({ error: 'Failed to verify access' });
      }
    }

    // Same policy as the 42 route: only finished words are cached, 1 h.
    const cacheKey = `open:${target.id}:${date}:${orderIndex}`;
    const cacheable = result.status === 'solved' || result.status === 'failed';
    if (cacheable) {
      const cached = getCachedGuesses(cacheKey);
      if (cached) return { guesses: cached };
    }

    const { data: guesses, error } = await db
      .from('guesses')
      .select('guess, feedback, created_at')
      .eq('word_result_id', result.id)
      .order('created_at', { ascending: true });

    if (error) return reply.code(500).send({ error: 'Failed to load guesses' });

    const payload = guesses ?? [];
    if (cacheable) setCachedGuesses(cacheKey, payload);

    return { guesses: payload };
  };
}

export default async function leaderboardRoutes(fastify) {
  installSchemaErrors(fastify);

  const authOnly = { preHandler: [fastify.requireAuth] };

  // Daily board. Open rows go through the allowlist before caching, so no
  // identity column can leak from the cache.
  fastify.get('/api/leaderboard', { ...authOnly, schema: DAILY_BOARD_SCHEMA }, async (request, reply) => {
    const scope = request.query.scope;
    if (!allowScope(scope, request, reply)) return;

    const date = request.query.date || getBerlinDateKey();

    const cached = getCachedLeaderboard(date, scope);
    if (cached) {
      return { date, scope, rows: cached };
    }

    // A handle change while this read is running bumps the scope epoch; the
    // rows below are then obsolete and must not be cached.
    const epoch = getScopeEpoch(scope);

    if (scope === 'open') {
      const { data, error } = await supabase
        .from('leaderboard_open')
        .select('handle, privacy_enabled, words_found, total_time, total_tries, word_statuses')
        .eq('draw_date', date)
        .eq('global_opt_in', true)
        .not('handle', 'is', null)
        .order('words_found', { ascending: false })
        .order('total_time', { ascending: true });

      if (error) return reply.code(500).send({ error: 'Failed to load leaderboard' });

      const rows = (data ?? []).map(toOpenDailyRow);
      if (getScopeEpoch(scope) === epoch) setCachedLeaderboard(date, 'open', rows);
      return { date, scope, rows };
    }

    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('draw_date', date)
      .order('words_found', { ascending: false })
      .order('total_time', { ascending: true });

    if (error) return reply.code(500).send({ error: 'Failed to load leaderboard' });

    if (getScopeEpoch(scope) === epoch) setCachedLeaderboard(date, '42', data ?? []);
    return { date, scope, rows: data };
  });

  fastify.get('/api/leaderboard/dates', authOnly, async (request, reply) => {
    try {
      return await loadDates();
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to load dates' });
    }
  });

  // Everything the UI needs before a board is loaded:
  //  - months: months that have at least monthlyMinDays days (newest first).
  //    A month with fewer days is not listed at all.
  //  - thresholds: the rules of each board, for the pickers and the About page.
  fastify.get('/api/leaderboard/meta', authOnly, async (request, reply) => {
    try {
      const dates = await loadDates();

      const perMonth = {};
      for (const d of dates) {
        const key = d.slice(0, 7);
        perMonth[key] = (perMonth[key] ?? 0) + 1;
      }

      const months = Object.keys(perMonth)
        .filter((key) => perMonth[key] >= LEADERBOARD_RULES.monthlyMinDays)
        .sort()
        .reverse();

      return {
        months,
        thresholds: { monthly: monthlyThresholds(), global: globalThresholds() },
      };
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to load leaderboard info' });
    }
  });

  // Monthly board. ?month=YYYY-MM (defaults to the current Berlin month).
  // The month is its own window: complete days, longevity and the min-days
  // threshold are all measured inside it.
  fastify.get('/api/leaderboard/monthly', { ...authOnly, schema: MONTHLY_BOARD_SCHEMA }, async (request, reply) => {
    const scope = request.query.scope;
    if (!allowScope(scope, request, reply)) return;

    const today = getBerlinDateKey();
    const currentMonth = today.slice(0, 7);
    const month = request.query.month || currentMonth;

    const match = MONTH_RE.exec(month);
    if (month > currentMonth) return reply.code(400).send({ error: 'month is in the future' });

    const isCurrent = month === currentMonth;
    const from = `${month}-01`;
    const monthEnd = `${month}-${String(lastDayOfMonth(Number(match[1]), Number(match[2]))).padStart(2, '0')}`;
    // Never count days that have not happened yet.
    const to = isCurrent ? today : monthEnd;
    const minDays = LEADERBOARD_RULES.monthlyMinDays;
    // The longevity bonus is measured against the whole month, even while it is running.
    const daysInMonth = lastDayOfMonth(Number(match[1]), Number(match[2]));

    try {
      const payload = await loadPeriod(`monthly:${scope}:${month}:${minDays}`, isCurrent, async () => ({
        month,
        scope,
        from,
        to,
        isCurrent,
        thresholds: monthlyThresholds(daysInMonth),
        rows: projectPeriodRows(scope, await fetchPeriodRows({
          p_from: from,
          p_to: to,
          p_min_days: minDays,
          p_try_penalty: LEADERBOARD_RULES.tryPenaltySeconds,
          p_longevity_max: LEADERBOARD_RULES.longevityMax,
          p_longevity_days: daysInMonth,
          p_fail_weight: LEADERBOARD_RULES.failPenaltyWeight,
          p_today: today,
          p_scope: scope,
        })),
      }));
      return payload;
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to load monthly leaderboard' });
    }
  });

  // All-time board. Longevity saturates at allTimeLongevityDays complete days.
  fastify.get('/api/leaderboard/global', { ...authOnly, schema: GLOBAL_BOARD_SCHEMA }, async (request, reply) => {
    const scope = request.query.scope;
    if (!allowScope(scope, request, reply)) return;

    const today = getBerlinDateKey();
    const minDays = LEADERBOARD_RULES.globalMinDays;

    try {
      const payload = await loadPeriod(`global:${scope}:${minDays}`, true, async () => ({
        scope,
        to: today,
        thresholds: globalThresholds(),
        rows: projectPeriodRows(scope, await fetchPeriodRows({
          p_from: null,
          p_to: today,
          p_min_days: minDays,
          p_try_penalty: LEADERBOARD_RULES.tryPenaltySeconds,
          p_longevity_max: LEADERBOARD_RULES.longevityMax,
          p_longevity_days: LEADERBOARD_RULES.allTimeLongevityDays,
          p_fail_weight: LEADERBOARD_RULES.failPenaltyWeight,
          p_today: today,
          p_scope: scope,
        })),
      }));
      return payload;
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to load global leaderboard' });
    }
  });

  fastify.get(
    '/api/leaderboard/word-guesses',
    {
      preHandler: [fastify.requireAuth],
      schema: WORD_GUESSES_SCHEMA,
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    makeWordGuessesHandler()
  );

  fastify.get('/api/leaderboard/word-times', { ...authOnly, schema: WORD_TIMES_SCHEMA }, makeWordTimesHandler());
}