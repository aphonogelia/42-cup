-- Drop users.display_name. It was only ever copied from 42 and read nowhere:
-- the 42 boards render the login, the open board renders the handle, and no
-- route, view or search depends on it. Keeping it was unnecessary personal data
-- (Art. 5(1)(c) GDPR).
--
-- Deploy order:
--   1. feature migrations (the schema and leaderboard_period this builds on)
--   2. the backend that no longer reads or writes display_name
--   3. this migration
--   4. the frontend
-- This migration removes the column and the field from leaderboard_period() in
-- one transaction, so an old backend that still selects it would fail between
-- steps 2 and 3. The column drop is irreversible, and the data export no longer
-- contains the field.
--
-- Object order matters, do not reorder:
--   1. leaderboard_period()  return type changes, so DROP + CREATE (not OR REPLACE)
--   2. users.display_name    only droppable after the function stops selecting it
--   3. API schema cache      PostgREST must forget the old function signature


-- 1. Period boards without display_name ------------------------------------------
DROP FUNCTION IF EXISTS public.leaderboard_period(
  date, date, integer, numeric, numeric, integer, numeric, date, text
);

CREATE OR REPLACE FUNCTION public.leaderboard_period (
  p_from           date,
  p_to             date,
  p_min_days       integer,
  p_try_penalty    numeric,
  p_longevity_max  numeric,
  p_longevity_days integer,
  p_fail_weight    numeric,
  p_today          date,
  p_scope          text DEFAULT '42'
)
  RETURNS TABLE (
    user_id       uuid,
    login         text,
    avatar_url    text,
    days_complete integer,
    words_started integer,
    words_solved  integer,
    solve_rate    numeric,
    avg_tries     numeric,
    median_time   numeric,
    median_cost   numeric,
    score         numeric,
    qualified     boolean,
    handle        text,
    privacy_enabled boolean
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
  select u.id, u.login, u.avatar_url,
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
         (a.days_complete >= p_min_days),
         case when p_scope = 'open' then u.handle end,
         u.privacy_enabled
  from agg a
  join users u on u.id = a.user_id
  where (p_scope = 'open' and u.global_opt_in and u.handle is not null)
     or (p_scope = '42'   and not u.is_guest)
$function$;

-- Same privileges as the signature this migration replaces.
GRANT EXECUTE ON FUNCTION public.leaderboard_period(
  date, date, integer, numeric, numeric, integer, numeric, date, text
) TO PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.leaderboard_period(
  date, date, integer, numeric, numeric, integer, numeric, date, text
) FROM postgres;

GRANT EXECUTE ON FUNCTION public.leaderboard_period(
  date, date, integer, numeric, numeric, integer, numeric, date, text
) TO postgres;

GRANT EXECUTE ON FUNCTION public.leaderboard_period(
  date, date, integer, numeric, numeric, integer, numeric, date, text
) TO service_role;


-- 2. The column -------------------------------------------------------------------
ALTER TABLE public.users DROP COLUMN IF EXISTS display_name;


-- 3. API schema cache --------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
