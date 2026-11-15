-- Leaderboard thresholds are owned by the backend
-- (backend/src/lib/leaderboardConfig.js), which always passes every value to
-- this function. The previous DEFAULTs were a second copy of those numbers and
-- would silently win for any caller that omitted an argument.
--
-- PostgreSQL cannot remove parameter defaults with CREATE OR REPLACE, so the
-- function is dropped and recreated with every parameter required. Signature
-- and return type are unchanged; the grants from the original schema are
-- restored explicitly below.

DROP FUNCTION IF EXISTS public.leaderboard_period(
  date, date, integer, numeric, numeric, integer, numeric, date
);

CREATE FUNCTION public.leaderboard_period (
  p_from           date,
  p_to             date,
  p_min_days       integer,
  p_try_penalty    numeric,
  p_longevity_max  numeric,
  p_longevity_days integer,
  p_fail_weight    numeric,
  p_today          date
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

-- Same privileges as the function this migration replaces.
GRANT EXECUTE ON FUNCTION public.leaderboard_period(
  date, date, integer, numeric, numeric, integer, numeric, date
) TO PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.leaderboard_period(
  date, date, integer, numeric, numeric, integer, numeric, date
) FROM postgres;

GRANT EXECUTE ON FUNCTION public.leaderboard_period(
  date, date, integer, numeric, numeric, integer, numeric, date
) TO postgres;

GRANT EXECUTE ON FUNCTION public.leaderboard_period(
  date, date, integer, numeric, numeric, integer, numeric, date
) TO service_role;

