-- Two more cached sections for the public page, rebuilt nightly with the others.
--   first_words  : top 10 openers (first guess of each game), non-guest, closed days,
--                  only words used by at least 3 different players.
--   sample_games : 12 random solved games (past words only, no user info) for the hero.
-- Requires 20261023220000_stats_cache.sql.

CREATE OR REPLACE FUNCTION public.refresh_first_words ()
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_today   date := ((now() AT TIME ZONE 'Europe/Berlin'::text))::date;
  v_payload jsonb;
BEGIN
  WITH firsts AS (
    SELECT DISTINCT ON (g.word_result_id) lower(g.guess) AS word, vr.user_id
    FROM public.guesses g
    JOIN public.valid_results vr ON vr.word_result_id = g.word_result_id
    WHERE NOT vr.is_guest AND vr.draw_date < v_today
    ORDER BY g.word_result_id, g.created_at
  ),
  agg AS (
    SELECT word, count(*)::int AS n, count(DISTINCT user_id)::int AS players
    FROM firsts
    GROUP BY word
  ),
  top AS (
    SELECT * FROM agg WHERE players >= 3 ORDER BY n DESC, word LIMIT 10
  )
  SELECT jsonb_build_object(
           'games', (SELECT COALESCE(sum(n), 0) FROM agg),
           'top', COALESCE((SELECT jsonb_agg(
                   jsonb_build_object('word', word, 'count', n, 'players', players)
                   ORDER BY n DESC, word) FROM top), '[]'::jsonb))
  INTO v_payload;

  INSERT INTO public.stats_cache (key, payload, updated_at)
  VALUES ('first_words', v_payload, now())
  ON CONFLICT (key) DO UPDATE
    SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_sample_games ()
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_today   date := ((now() AT TIME ZONE 'Europe/Berlin'::text))::date;
  v_payload jsonb;
BEGIN
  WITH picked AS (
    SELECT vr.word_result_id, vr.answer
    FROM public.valid_results vr
    WHERE NOT vr.is_guest AND vr.status = 'solved'
      AND vr.draw_date < v_today AND vr.nb_tries BETWEEN 2 AND 6
    ORDER BY random()
    LIMIT 12
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'answer', p.answer,
           'guesses', (SELECT jsonb_agg(jsonb_build_object('guess', g.guess, 'feedback', g.feedback)
                                        ORDER BY g.created_at)
                       FROM public.guesses g WHERE g.word_result_id = p.word_result_id))),
         '[]'::jsonb)
  INTO v_payload
  FROM picked p;

  INSERT INTO public.stats_cache (key, payload, updated_at)
  VALUES ('sample_games', v_payload, now())
  ON CONFLICT (key) DO UPDATE
    SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_stats ()
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
BEGIN
  PERFORM public.refresh_stats_daily();
  PERFORM public.refresh_public_stats();
  PERFORM public.refresh_first_words();
  PERFORM public.refresh_sample_games();
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.refresh_first_words() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_sample_games() FROM PUBLIC, anon, authenticated;

SELECT public.refresh_stats();