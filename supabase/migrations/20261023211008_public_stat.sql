-- Public, aggregate-only stats for stat.wd42.xyz.
-- Reads valid_results (flagged days removed, past unfinished words = failed).
-- Guests excluded, like the rankings. Today's in_progress words are not counted yet.
CREATE OR REPLACE FUNCTION public.public_stats ()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  AS $function$
  with vr as (
    select user_id, draw_date, status, nb_tries, time_seconds
    from valid_results
    where not is_guest and status <> 'in_progress'
  ),
  totals as (
    select count(distinct user_id)::int as players,
           count(*) filter (where status = 'solved')::int as words_solved,
           count(*) filter (where status = 'failed')::int as words_failed,
           percentile_cont(0.5) within group (order by time_seconds)
             filter (where status = 'solved') as median_solve_time
    from vr
  ),
  dist as (
    select nb_tries::text as k, count(*)::int as c
    from vr
    where status = 'solved' and nb_tries between 1 and 6
    group by nb_tries
  ),
  daily as (
    select draw_date,
           count(*) filter (where status = 'solved')::int as solved,
           count(*) filter (where status = 'failed')::int as failed,
           count(distinct user_id)::int as players
    from vr
    group by draw_date
  )
  select jsonb_build_object(
    'players', t.players,
    'wordsSolved', t.words_solved,
    'wordsFailed', t.words_failed,
    'solveRate', case when t.words_solved + t.words_failed > 0
                      then round(100.0 * t.words_solved / (t.words_solved + t.words_failed), 1) end,
    'medianSolveTime', round(t.median_solve_time::numeric, 1),
    'guessDistribution', (select coalesce(jsonb_object_agg(k, c), '{}'::jsonb) from dist),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
                'date', draw_date, 'solved', solved, 'failed', failed, 'players', players)
                order by draw_date), '[]'::jsonb) from daily)
  )
  from totals t
$function$;

-- Backend only (service role), same as user_rank_counts.
REVOKE EXECUTE ON FUNCTION public.public_stats() FROM PUBLIC, anon, authenticated;