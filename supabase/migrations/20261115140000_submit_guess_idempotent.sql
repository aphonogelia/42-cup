-- Retried guesses must not consume another try.
--
-- submit_guess already serializes on the word_results row, but a duplicate
-- non-winning guess left the status as in_progress. The waiting request then
-- inserted the same guess again and incremented nb_tries a second time.
--
-- This check runs while holding the same word_results row lock, so every
-- writer sees the previous guess before it can insert its own.

CREATE OR REPLACE FUNCTION public.submit_guess (
  p_user_id   uuid,
  p_word_id   integer,
  p_guess     text,
  p_feedback  jsonb,
  p_is_win    boolean,
  p_max_tries integer
)
  RETURNS public.word_results
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_result      word_results;
  v_nb_tries    int;
  v_out_of_tries boolean;
BEGIN
  INSERT INTO word_results (user_id, word_id, status)
  VALUES (p_user_id, p_word_id, 'in_progress')
  ON CONFLICT (user_id, word_id) DO NOTHING;

  SELECT * INTO v_result
  FROM word_results
  WHERE user_id = p_user_id AND word_id = p_word_id
  FOR UPDATE;

  IF v_result.status <> 'in_progress' THEN
    RETURN v_result;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM guesses
    WHERE word_result_id = v_result.id
      AND guess = p_guess
  ) THEN
    RETURN v_result;
  END IF;

  v_nb_tries := v_result.nb_tries + 1;
  v_out_of_tries := (NOT p_is_win) AND v_nb_tries >= p_max_tries;

  INSERT INTO guesses (word_result_id, guess, feedback)
  VALUES (v_result.id, p_guess, p_feedback);

  UPDATE word_results
  SET nb_tries   = v_nb_tries,
      started_at = COALESCE(started_at, CASE WHEN v_result.nb_tries = 0 THEN now() END),
      status     = CASE WHEN p_is_win THEN 'solved'
                         WHEN v_out_of_tries THEN 'failed'
                         ELSE status END,
      solved_at  = CASE WHEN p_is_win OR v_out_of_tries THEN now() ELSE solved_at END
  WHERE id = v_result.id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;
