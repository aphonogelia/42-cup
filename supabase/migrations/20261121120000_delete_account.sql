-- Account deletion for GDPR Art. 17.
--
-- The schema has no ON DELETE CASCADE, so children are removed explicitly,
-- in the same order as purge_inactive_guests. One transaction: either the
-- whole account is gone or nothing happened.
--
-- Called with the service role only. REVOKE keeps it out of PostgREST so a
-- client can never delete an arbitrary user id.

CREATE OR REPLACE FUNCTION public.delete_account (p_user_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $function$
BEGIN
  DELETE FROM guesses g
    USING word_results wr
    WHERE g.word_result_id = wr.id AND wr.user_id = p_user_id;

  DELETE FROM word_results WHERE user_id = p_user_id;
  DELETE FROM flagged_users WHERE user_id = p_user_id;
  DELETE FROM users WHERE id = p_user_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_account(uuid) FROM PUBLIC, anon, authenticated;

-- The API calls this with the service-role key, so that role needs it
-- explicitly once PUBLIC has been revoked.
GRANT EXECUTE ON FUNCTION public.delete_account(uuid) TO "service_role";
