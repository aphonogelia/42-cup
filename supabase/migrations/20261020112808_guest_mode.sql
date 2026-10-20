-- Guest mode migration
-- Safe to run before any code change: nothing reads is_guest yet.

-- 1. Guests are real rows in users, flagged, with no 42 identity ---------------
ALTER TABLE public.users ALTER COLUMN intra_id DROP NOT NULL;

ALTER TABLE public.users
  ADD COLUMN is_guest boolean NOT NULL DEFAULT false;

-- A guest has no intra_id; a real user always has one.
ALTER TABLE public.users
  ADD CONSTRAINT users_guest_intra_check
  CHECK ((is_guest AND intra_id IS NULL) OR (NOT is_guest AND intra_id IS NOT NULL));

CREATE INDEX users_guest_created_idx ON public.users (created_at) WHERE is_guest;


-- 2. Guests never appear in rankings or podiums --------------------------------
-- The `leaderboard` view feeds the daily ledger and the podium counts in stats.
CREATE OR REPLACE VIEW "public"."leaderboard" WITH (security_invoker=on) AS  WITH active_users AS (
         SELECT DISTINCT wr_1.user_id,
            w_1.draw_date
           FROM (public.word_results wr_1
             JOIN public.words w_1 ON ((w_1.id = wr_1.word_id)))
          WHERE ((wr_1.status = ANY (ARRAY['solved'::text, 'failed'::text])) AND (NOT (EXISTS ( SELECT 1
                   FROM public.flagged_users f
                  WHERE ((f.user_id = wr_1.user_id) AND (f.draw_date = w_1.draw_date))))))
        )
 SELECT u.id AS user_id,
    u.login,
    u.avatar_url,
    u.privacy_enabled,
    au.draw_date,
    count(*) FILTER (WHERE (wr.status = 'solved'::text)) AS words_found,
    COALESCE(sum(wr.time_seconds) FILTER (WHERE (wr.status = ANY (ARRAY['solved'::text, 'failed'::text]))), (0)::numeric) AS total_time,
    COALESCE(sum(wr.nb_tries) FILTER (WHERE (wr.status = ANY (ARRAY['solved'::text, 'failed'::text]))), (0)::bigint) AS total_tries,
    array_agg(COALESCE(wr.status, 'not_started'::text) ORDER BY w.order_index) AS word_statuses
   FROM (((active_users au
     JOIN public.users u ON ((u.id = au.user_id)))
     JOIN public.words w ON ((w.draw_date = au.draw_date)))
     LEFT JOIN public.word_results wr ON (((wr.user_id = u.id) AND (wr.word_id = w.id))))
  WHERE (NOT u.is_guest)
  GROUP BY u.id, u.login, u.avatar_url, u.privacy_enabled, au.draw_date
 HAVING (sum(
        CASE
            WHEN (wr.status = ANY (ARRAY['solved'::text, 'failed'::text])) THEN 1
            ELSE 0
        END) > 0);

-- Monthly / global rankings: same body as before, one added filter on the last select.
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
  agg as (
    select cd.user_id,
      count(distinct cd.draw_date)::int as days_complete,
      count(*)::int as words_started,
      count(*) filter (where wr.status = 'solved')::int as words_solved,
      avg(wr.nb_tries) filter (where wr.status = 'solved') as avg_tries,
      percentile_cont(0.5) within group (order by wr.time_seconds)
        filter (where wr.status = 'solved') as median_time,
      percentile_cont(0.5) within group (
        order by coalesce(wr.time_seconds, 0) + (wr.nb_tries - 1) * p_try_penalty)
        filter (where wr.status = 'solved') as median_cost
    from complete_days cd
    join words w on w.draw_date = cd.draw_date
    join word_results wr on wr.word_id = w.id and wr.user_id = cd.user_id
    where wr.nb_tries > 0
      and not (wr.status = 'in_progress' and w.draw_date >= p_today)
    group by cd.user_id
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


-- 3. Purge guests inactive for N days -------------------------------------------
-- No ON DELETE CASCADE in this schema, so children are deleted explicitly.
-- Activity = latest guess; a guest who never played falls back to created_at.
CREATE OR REPLACE FUNCTION public.purge_inactive_guests (p_days integer DEFAULT 90)
  RETURNS integer
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_ids   uuid[];
  v_count integer;
BEGIN
  SELECT array_agg(u.id) INTO v_ids
  FROM users u
  WHERE u.is_guest
    AND GREATEST(
          COALESCE(u.created_at, 'epoch'::timestamptz),
          COALESCE((SELECT max(g.created_at)
                    FROM word_results wr
                    JOIN guesses g ON g.word_result_id = wr.id
                    WHERE wr.user_id = u.id), 'epoch'::timestamptz)
        ) < now() - make_interval(days => p_days);

  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM guesses g
    USING word_results wr
    WHERE g.word_result_id = wr.id AND wr.user_id = ANY (v_ids);
  DELETE FROM word_results WHERE user_id = ANY (v_ids);
  DELETE FROM flagged_users WHERE user_id = ANY (v_ids);
  DELETE FROM users WHERE id = ANY (v_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- Not callable through the public API (PostgREST rpc); only cron / postgres.
REVOKE EXECUTE ON FUNCTION public.purge_inactive_guests(integer) FROM PUBLIC, anon, authenticated;

-- Daily at 03:00 UTC (pg_cron runs in UTC).
SELECT cron.schedule(
  'purge-inactive-guests',
  '0 3 * * *',
  $$SELECT public.purge_inactive_guests(90)$$
);
