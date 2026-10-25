-- Public stats, computed once per day and cached.
--
-- stats_daily : one row per CLOSED day (draw_date < today Berlin), guests and non-guests
--               counted separately. Insert-only: a day is never recomputed, so the
--               90-day guest purge cannot shrink history. To recompute a day by hand,
--               delete its row and run refresh_stats().
-- stats_cache : one JSON payload per section of the public page (key -> payload).
--               Later phases add keys; the backend just reads all rows.
--
-- All counts read valid_results (flagged days removed; a word still in_progress on a
-- past day is 'failed'), so on a closed day: played = solved + failed.
-- Today is not included; it appears after the nightly run.

-- 1. Tables ---------------------------------------------------------------------
CREATE TABLE public.stats_daily (
  draw_date      date        PRIMARY KEY,
  users_players  integer     NOT NULL,
  users_solved   integer     NOT NULL,
  users_failed   integer     NOT NULL,
  guests_players integer     NOT NULL,
  guests_solved  integer     NOT NULL,
  guests_failed  integer     NOT NULL,
  computed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.stats_cache (
  key        text        PRIMARY KEY,
  payload    jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stats_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stats_cache ENABLE ROW LEVEL SECURITY;

-- Backend only (service role). No policies on purpose.
REVOKE ALL ON public.stats_daily, public.stats_cache FROM anon, authenticated;


-- 2. Daily rows (insert missing closed days only) ---------------------------------
CREATE OR REPLACE FUNCTION public.refresh_stats_daily ()
  RETURNS integer
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_today date := ((now() AT TIME ZONE 'Europe/Berlin'::text))::date;
  v_count integer;
BEGIN
  INSERT INTO public.stats_daily
    (draw_date, users_players, users_solved, users_failed,
     guests_players, guests_solved, guests_failed)
  SELECT vr.draw_date,
         count(DISTINCT vr.user_id) FILTER (WHERE NOT vr.is_guest),
         count(*) FILTER (WHERE NOT vr.is_guest AND vr.status = 'solved'),
         count(*) FILTER (WHERE NOT vr.is_guest AND vr.status = 'failed'),
         count(DISTINCT vr.user_id) FILTER (WHERE vr.is_guest),
         count(*) FILTER (WHERE vr.is_guest AND vr.status = 'solved'),
         count(*) FILTER (WHERE vr.is_guest AND vr.status = 'failed')
  FROM public.valid_results vr
  WHERE vr.draw_date < v_today
    AND NOT EXISTS (
      SELECT 1 FROM public.stats_daily s WHERE s.draw_date = vr.draw_date
    )
  GROUP BY vr.draw_date
  ON CONFLICT (draw_date) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;


-- 3. Cached section: overview -------------------------------------------------------
-- Totals and the daily series come from stats_daily (guest history survives the purge).
-- Players, median solve time and guess distribution are non-guest only, like the rankings.
CREATE OR REPLACE FUNCTION public.refresh_public_stats ()
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_today   date := ((now() AT TIME ZONE 'Europe/Berlin'::text))::date;
  v_payload jsonb;
BEGIN
  SELECT jsonb_build_object(
           'throughDate', max(draw_date),
           'wordsPlayed', jsonb_build_object(
             'users',  COALESCE(sum(users_solved + users_failed), 0),
             'guests', COALESCE(sum(guests_solved + guests_failed), 0)),
           'wordsSolved', COALESCE(sum(users_solved), 0),
           'wordsFailed', COALESCE(sum(users_failed), 0),
           'guestPlayerDays', COALESCE(sum(guests_players), 0),
           'daily', COALESCE(jsonb_agg(jsonb_build_object(
               'date', draw_date,
               'users',  jsonb_build_object(
                 'players', users_players, 'solved', users_solved, 'failed', users_failed),
               'guests', jsonb_build_object(
                 'players', guests_players, 'solved', guests_solved, 'failed', guests_failed))
             ORDER BY draw_date), '[]'::jsonb))
  INTO v_payload
  FROM public.stats_daily;

  v_payload := v_payload
    || (SELECT jsonb_build_object(
               'players', count(DISTINCT user_id),
               'medianSolveTime', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY time_seconds)
                                          FILTER (WHERE status = 'solved'))::numeric, 1))
        FROM public.valid_results
        WHERE NOT is_guest AND draw_date < v_today)
    || jsonb_build_object('guessDistribution', (
         SELECT COALESCE(jsonb_object_agg(nb_tries::text, c), '{}'::jsonb)
         FROM (
           SELECT nb_tries, count(*)::int AS c
           FROM public.valid_results
           WHERE NOT is_guest AND draw_date < v_today
             AND status = 'solved' AND nb_tries BETWEEN 1 AND 6
           GROUP BY nb_tries
         ) d));

  INSERT INTO public.stats_cache (key, payload, updated_at)
  VALUES ('overview', v_payload, now())
  ON CONFLICT (key) DO UPDATE
    SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at;
END;
$function$;


-- 4. One entry point, called by cron. Later phases add their refresh here. ------------
CREATE OR REPLACE FUNCTION public.refresh_stats ()
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
BEGIN
  PERFORM public.refresh_stats_daily();
  PERFORM public.refresh_public_stats();
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.refresh_stats_daily() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_public_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_stats() FROM PUBLIC, anon, authenticated;


-- 5. Nightly job ---------------------------------------------------------------------
-- pg_cron runs in UTC. 23:30 UTC is 00:30 Berlin in winter and 01:30 in summer, so it
-- is always after Berlin midnight (DST-safe) and before the 03:00 UTC guest purge.
SELECT cron.schedule(
  'refresh-stats',
  '30 23 * * *',
  $$SELECT public.refresh_stats()$$
);


-- 6. Backfill all closed days now and fill the cache once ----------------------------
SELECT public.refresh_stats();