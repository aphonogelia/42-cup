-- Split guess submission into three independent concerns.
--
--   1. concurrency : keep the word_results row lock; it serialises every writer
--                    for the same result, exactly as before.
--   2. idempotency : guess_submissions records one row per client submission id,
--                    so a retried HTTP request replays its outcome instead of
--                    being processed a second time.
--   3. game rules  : a repeated guess is rejected explicitly and touches no try,
--                    status or timing.
--
-- Before this, submit_guess treated a repeated guess as a silent no-op and
-- returned the same word_results row, so the API could not tell an accepted
-- guess from an ignored one. The outcome is explicit now.

-- 1. Submission log -------------------------------------------------------------
-- A submission is an HTTP request; a guess is an accepted game attempt. A
-- rejected duplicate still records its submission, but inserts no guess.
CREATE TABLE public.guess_submissions (
  submission_id  uuid        PRIMARY KEY,
  user_id        uuid        NOT NULL REFERENCES public.users(id),
  word_result_id uuid        NOT NULL REFERENCES public.word_results(id),
  guess          text        NOT NULL,
  outcome        text        NOT NULL,
  nb_tries       integer     NOT NULL,
  status         text        NOT NULL,
  feedback       jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guess_submissions_outcome_check
    CHECK (outcome IN ('accepted', 'duplicate_guess', 'word_finished'))
);

-- The purge deletes children explicitly (no ON DELETE CASCADE in this schema).
CREATE INDEX guess_submissions_word_result_id_idx
  ON public.guess_submissions (word_result_id);

-- Backend only (service role), like stats_cache. No policies on purpose.
ALTER TABLE public.guess_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guess_submissions FROM anon, authenticated;


-- 2. submit_guess ---------------------------------------------------------------
-- Return type changes from word_results to jsonb, so the function is recreated.
DROP FUNCTION IF EXISTS public.submit_guess(uuid, integer, text, jsonb, boolean, integer);

CREATE FUNCTION public.submit_guess (
  p_user_id       uuid,
  p_word_id       integer,
  p_submission_id uuid,
  p_guess         text,
  p_feedback      jsonb,
  p_is_win        boolean,
  p_max_tries     integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_result       word_results;
  v_submission   guess_submissions;
  v_outcome      text;
  v_feedback     jsonb;
  v_nb_tries     int;
  v_out_of_tries boolean;
BEGIN
  INSERT INTO word_results (user_id, word_id, status)
  VALUES (p_user_id, p_word_id, 'in_progress')
  ON CONFLICT (user_id, word_id) DO NOTHING;

  -- Concurrency control: every writer for this user/word queues here.
  SELECT * INTO v_result
  FROM word_results
  WHERE user_id = p_user_id AND word_id = p_word_id
  FOR UPDATE;

  -- Idempotency: has this submission already been processed?
  SELECT * INTO v_submission
  FROM guess_submissions
  WHERE submission_id = p_submission_id;

  IF FOUND THEN
    IF v_submission.user_id <> p_user_id
       OR v_submission.word_result_id <> v_result.id
       OR v_submission.guess <> p_guess THEN
      RAISE EXCEPTION USING
        ERRCODE = 'WD002',
        MESSAGE = 'submission_id_reused';
    END IF;

    -- Replay the stored outcome with the current result. Returning the stored
    -- snapshot would push the board backwards when later guesses exist.
    RETURN jsonb_build_object(
      'outcome',  v_submission.outcome,
      'result',   to_jsonb(v_result),
      'feedback', v_submission.feedback,
      'guesses',  COALESCE((
        SELECT jsonb_agg(jsonb_build_object('guess', g.guess, 'feedback', g.feedback)
                         ORDER BY g.created_at, g.id)
        FROM guesses g WHERE g.word_result_id = v_result.id
      ), '[]'::jsonb)
    );
  END IF;

  -- Game rules. Rejections never touch nb_tries, status or timing.
  IF EXISTS (
    SELECT 1 FROM guesses
    WHERE word_result_id = v_result.id AND guess = p_guess
  ) THEN
    v_outcome := 'duplicate_guess';
  ELSIF v_result.status <> 'in_progress' THEN
    v_outcome := 'word_finished';
  ELSE
    v_outcome := 'accepted';
  END IF;

  IF v_outcome = 'accepted' THEN
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

    v_feedback := p_feedback;
  END IF;

  -- Same transaction as the guess write: either both land or neither does.
  -- A concurrent request holding the same id blocks here; the primary key then
  -- turns this insert into a no-op, and the raise below rolls this request's
  -- guess back. That is what keeps one id from being processed twice, and it
  -- keeps the caller from ever seeing a raw unique-violation.
  INSERT INTO guess_submissions (
    submission_id, user_id, word_result_id, guess, outcome, nb_tries, status, feedback
  )
  VALUES (
    p_submission_id, p_user_id, v_result.id, p_guess, v_outcome,
    v_result.nb_tries, v_result.status, v_feedback
  )
  ON CONFLICT (submission_id) DO NOTHING;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'WD002',
      MESSAGE = 'submission_id_reused';
  END IF;

  RETURN jsonb_build_object(
    'outcome',  v_outcome,
    'result',   to_jsonb(v_result),
    'feedback', v_feedback,
    'guesses',  COALESCE((
      SELECT jsonb_agg(jsonb_build_object('guess', g.guess, 'feedback', g.feedback)
                       ORDER BY g.created_at, g.id)
      FROM guesses g WHERE g.word_result_id = v_result.id
    ), '[]'::jsonb)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.submit_guess(uuid, integer, uuid, text, jsonb, boolean, integer)
  TO PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION public.submit_guess(uuid, integer, uuid, text, jsonb, boolean, integer) FROM "postgres";
GRANT EXECUTE ON FUNCTION public.submit_guess(uuid, integer, uuid, text, jsonb, boolean, integer) TO "postgres";
GRANT EXECUTE ON FUNCTION public.submit_guess(uuid, integer, uuid, text, jsonb, boolean, integer) TO "service_role";


-- 3. Guest purge ----------------------------------------------------------------
-- Submissions reference word_results, and this schema never uses ON DELETE
-- CASCADE, so they must be removed before the word results.
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

  DELETE FROM guess_submissions gs
    USING word_results wr
    WHERE gs.word_result_id = wr.id AND wr.user_id = ANY (v_ids);
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
