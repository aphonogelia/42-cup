-- delete_account must remove guess_submissions before word_results: both
-- guess_submissions FKs are RESTRICT, so an account with submissions hits 23503
-- and the whole deletion rolls back.
--
-- Same order as purge_inactive_guests: submissions, guesses, word_results,
-- flagged_users, users.
--
-- FKs checked: users <- flagged_users, word_results, guess_submissions;
-- word_results <- guesses, guess_submissions. Nothing else.

CREATE OR REPLACE FUNCTION public.delete_account (p_user_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $function$
BEGIN
  DELETE FROM guess_submissions gs
    USING word_results wr
    WHERE gs.word_result_id = wr.id AND wr.user_id = p_user_id;

  DELETE FROM guesses g
    USING word_results wr
    WHERE g.word_result_id = wr.id AND wr.user_id = p_user_id;

  DELETE FROM word_results WHERE user_id = p_user_id;
  DELETE FROM flagged_users WHERE user_id = p_user_id;
  DELETE FROM users WHERE id = p_user_id;
END;
$function$;

-- Same privileges as before (CREATE OR REPLACE keeps them, re-stated explicitly).
REVOKE EXECUTE ON FUNCTION public.delete_account(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.delete_account(uuid) TO "service_role";
