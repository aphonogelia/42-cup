import { supabase } from '../supabase.js';
import { getBerlinDateKey } from '../lib/dailyDraw.js';
import {
  getCachedLeaderboard,
  getCachedLeaderboardDates,
  setCachedLeaderboard,
  setCachedLeaderboardDates,
  getCachedWordTimes,
  setCachedWordTimes,
  loadPeriod,
} from '../lib/leaderboardCache.js';
import { LEADERBOARD_RULES } from '../lib/leaderboardConfig.js';

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

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
  fastify.get('/api/leaderboard/meta', async (request, reply) => {
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
  fastify.get('/api/leaderboard/monthly', async (request, reply) => {
    const today = getBerlinDateKey();
    const currentMonth = today.slice(0, 7);
    const month = request.query.month || currentMonth;

    const match = MONTH_RE.exec(month);
    if (!match) return reply.code(400).send({ error: 'month must be YYYY-MM' });
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
      const payload = await loadPeriod(`monthly:${month}:${minDays}`, isCurrent, async () => ({
        month,
        from,
        to,
        isCurrent,
        thresholds: monthlyThresholds(daysInMonth),
        rows: await fetchPeriodRows({
          p_from: from,
          p_to: to,
          p_min_days: minDays,
          p_try_penalty: LEADERBOARD_RULES.tryPenaltySeconds,
          p_longevity_max: LEADERBOARD_RULES.longevityMax,
          p_longevity_days: daysInMonth,
          p_fail_weight: LEADERBOARD_RULES.failPenaltyWeight,
          p_today: today,
        }),
      }));
      return payload;
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to load monthly leaderboard' });
    }
  });

  // All-time board. Longevity saturates at allTimeLongevityDays complete days.
  fastify.get('/api/leaderboard/global', async (request, reply) => {
    const today = getBerlinDateKey();
    const minDays = LEADERBOARD_RULES.globalMinDays;

    try {
      const payload = await loadPeriod(`global:${minDays}`, true, async () => ({
        to: today,
        thresholds: globalThresholds(),
        rows: await fetchPeriodRows({
          p_to: today,
          p_min_days: minDays,
          p_try_penalty: LEADERBOARD_RULES.tryPenaltySeconds,
          p_longevity_max: LEADERBOARD_RULES.longevityMax,
          p_longevity_days: LEADERBOARD_RULES.allTimeLongevityDays,
          p_fail_weight: LEADERBOARD_RULES.failPenaltyWeight,
          p_today: today,
        }),
      }));
      return payload;
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to load global leaderboard' });
    }
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