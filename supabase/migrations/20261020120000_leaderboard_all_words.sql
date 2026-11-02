-- Rank users by all played words after applying the complete-day eligibility rule.
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
    select wr.user_id, w.draw_date
    from word_results wr
    join words w on w.id = wr.word_id
    join day_totals dt on dt.draw_date = w.draw_date
    where wr.nb_tries > 0
      and not exists (
        select 1 from flagged_users f
        where f.user_id = wr.user_id and f.draw_date = w.draw_date
      )
    group by wr.user_id, w.draw_date, dt.total
    having count(*) = dt.total
  ),
  complete_day_counts as (
    select user_id, count(*)::int as days_complete
    from complete_days
    group by user_id
  ),
  agg as (
    select cdc.user_id,
      cdc.days_complete,
      count(*)::int as words_started,
      count(*) filter (where wr.status = 'solved')::int as words_solved,
      avg(wr.nb_tries) filter (where wr.status = 'solved') as avg_tries,
      percentile_cont(0.5) within group (order by wr.time_seconds)
        filter (where wr.status = 'solved') as median_time,
      percentile_cont(0.5) within group (
        order by coalesce(wr.time_seconds, 0) + (wr.nb_tries - 1) * p_try_penalty)
        filter (where wr.status = 'solved') as median_cost
    from complete_day_counts cdc
    join word_results wr on wr.user_id = cdc.user_id
    join words w on w.id = wr.word_id
    where wr.nb_tries > 0
      and (p_from is null or w.draw_date >= p_from)
      and (p_to is null or w.draw_date <= p_to)
      and not exists (
        select 1 from flagged_users f
        where f.user_id = wr.user_id and f.draw_date = w.draw_date
      )
      and not (wr.status = 'in_progress' and w.draw_date >= p_today)
    group by cdc.user_id, cdc.days_complete
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
  from agg a join users u on u.id = a.user_id
  where not u.is_guest
$function$;
