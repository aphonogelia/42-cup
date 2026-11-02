-- Single source of truth for rankings and stats.
--
-- valid_results = one row per started word (nb_tries > 0), flagged user-days removed.
--   * a word still in_progress on a day BEFORE today (Berlin) is failed: unfinished at midnight.
--     Derived here, no data change, no cron. Today's in_progress stays in_progress.
--   * guests are kept (is_guest exposed): their own Stats page reads this view.
--     Rankings filter them out.
-- Everything below reads valid_results, so the rules live in one place.

-- 1. Base view ---------------------------------------------------------------
CREATE OR REPLACE VIEW public.valid_results WITH (security_invoker = on) AS
SELECT wr.id          AS word_result_id,
       wr.user_id,
       u.is_guest,
       w.id           AS word_id,
       w.draw_date,
       w.order_index,
       w.answer,
       wr.nb_tries,
       CASE WHEN wr.status = 'in_progress'
                 AND w.draw_date < ((now() AT TIME ZONE 'Europe/Berlin'::text))::date
            THEN 'failed'
            ELSE wr.status
       END            AS status,
       wr.time_seconds
FROM public.word_results wr
JOIN public.words w ON w.id = wr.word_id
JOIN public.users u ON u.id = wr.user_id
WHERE wr.nb_tries > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.flagged_users f
    WHERE f.user_id = wr.user_id AND f.draw_date = w.draw_date
  );

-- Backend only (service role).
REVOKE ALL ON public.valid_results FROM anon, authenticated;


-- 2. Daily ledger -------------------------------------------------------------
-- Same columns, same order and types as before (required by CREATE OR REPLACE VIEW).
-- Anyone who started a word that day appears (0/N possible). An abandoned word
-- adds 0 to total_time, as before.
CREATE OR REPLACE VIEW public.leaderboard WITH (security_invoker = on) AS
SELECT u.id AS user_id,
       u.login,
       u.avatar_url,
       u.privacy_enabled,
       d.draw_date,
       count(*) FILTER (WHERE vr.status = 'solved') AS words_found,
       COALESCE(sum(vr.time_seconds) FILTER (WHERE vr.status = ANY (ARRAY['solved'::text, 'failed'::text])), (0)::numeric) AS total_time,
       COALESCE(sum(vr.nb_tries) FILTER (WHERE vr.status = ANY (ARRAY['solved'::text, 'failed'::text])), (0)::bigint) AS total_tries,
       array_agg(COALESCE(vr.status, 'not_started'::text) ORDER BY w.order_index) AS word_statuses
FROM (SELECT DISTINCT user_id, draw_date FROM public.valid_results) d
JOIN public.users u ON u.id = d.user_id AND NOT u.is_guest
JOIN public.words w ON w.draw_date = d.draw_date
LEFT JOIN public.valid_results vr ON vr.user_id = u.id AND vr.word_id = w.id
GROUP BY u.id, u.login, u.avatar_url, u.privacy_enabled, d.draw_date;


-- 3. Period boards ------------------------------------------------------------
-- Everything is per word. Complete days are used ONLY for `qualified` and the
-- longevity bonus. Today's in_progress words are not counted yet.
-- Signature unchanged; p_today is kept for compatibility and is now unused
-- (the "today" cutoff lives in valid_results).
CREATE OR REPLACE FUNCTION public.leaderboard_period (
  p_from           date    DEFAULT NULL::date,
  p_to             date    DEFAULT NULL::date,
  p_min_days       integer DEFAULT 15,
  p_try_penalty    numeric DEFAULT 20,
  p_longevity_max  numeric DEFAULT 0.10,
  p_longevity_days integer DEFAULT NULL::integer,
  p_fail_weight    numeric DEFAULT 3,
  p_today          date    DEFAULT ((now() AT TIME ZONE 'Europe/Berlin'::text))::date
)
  RETURNS TABLE (
    user_id       uuid,
    login         text,
    display_name  text,
    avatar_url    text,
    days_complete integer,
    words_started integer,
    words_solved  integer,
    solve_rate    numeric,
    avg_tries     numeric,
    median_time   numeric,
    median_cost   numeric,
    score         numeric,
    qualified     boolean
  )
  LANGUAGE sql
  STABLE
  AS $function$
  with day_totals as (
    select draw_date, count(*) as total
    from words
    where (p_from is null or draw_date >= p_from)
      and (p_to is null or draw_date <= p_to)
    group by draw_date
  ),
  complete_days as (
    select vr.user_id, vr.draw_date
    from valid_results vr
    join day_totals dt on dt.draw_date = vr.draw_date
    group by vr.user_id, vr.draw_date, dt.total
    having count(*) = dt.total
  ),
  complete_day_counts as (
    select user_id, count(*)::int as days_complete
    from complete_days
    group by user_id
  ),
  agg as (
    select vr.user_id,
           coalesce(c.days_complete, 0) as days_complete,
           count(*)::int as words_started,
           count(*) filter (where vr.status = 'solved')::int as words_solved,
           avg(vr.nb_tries) filter (where vr.status = 'solved') as avg_tries,
           percentile_cont(0.5) within group (order by vr.time_seconds)
             filter (where vr.status = 'solved') as median_time,
           percentile_cont(0.5) within group (
             order by coalesce(vr.time_seconds, 0) + (vr.nb_tries - 1) * p_try_penalty)
             filter (where vr.status = 'solved') as median_cost
    from valid_results vr
    left join complete_day_counts c on c.user_id = vr.user_id
    where vr.status <> 'in_progress'
      and (p_from is null or vr.draw_date >= p_from)
      and (p_to is null or vr.draw_date <= p_to)
    group by vr.user_id, c.days_complete
  )
  select u.id, u.login, u.display_name, u.avatar_url,
         a.days_complete, a.words_started, a.words_solved,
         round(100.0 * a.words_solved / a.words_started, 1),
         round(a.avg_tries, 2),
         round(a.median_time::numeric, 1),
         round(a.median_cost::numeric, 1),
         round(
           a.median_cost::numeric
           * (1 + p_fail_weight * (a.words_started - a.words_solved)::numeric / a.words_started)
           * (1 - p_longevity_max
                * least(a.days_complete::numeric
                        / coalesce(p_longevity_days, (select count(*) from day_totals)), 1))
         , 1),
         (a.days_complete >= p_min_days)
  from agg a
  join users u on u.id = a.user_id
  where not u.is_guest
$function$;


-- 4. Podium counts --------------------------------------------------------------
-- Ranked over all users on the daily ledger (view `leaderboard`), same order as the UI.
-- Today is included, as before.
CREATE OR REPLACE FUNCTION public.user_rank_counts (p_user_id uuid)
  RETURNS TABLE (top1 integer, top3 integer, top5 integer)
  LANGUAGE sql
  STABLE
  AS $function$
  SELECT count(*) FILTER (WHERE r = 1)::int,
         count(*) FILTER (WHERE r <= 3)::int,
         count(*) FILTER (WHERE r <= 5)::int
  FROM (
    SELECT user_id,
           rank() OVER (PARTITION BY draw_date
                        ORDER BY words_found DESC, total_time ASC) AS r
    FROM public.leaderboard
  ) x
  WHERE x.user_id = p_user_id
$function$;

REVOKE EXECUTE ON FUNCTION public.user_rank_counts(uuid) FROM PUBLIC, anon, authenticated;