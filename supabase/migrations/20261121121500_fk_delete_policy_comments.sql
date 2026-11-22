-- Documents why these foreign keys deliberately have no ON DELETE CASCADE.
--
-- Account deletion goes through delete_account() and the daily guest purge
-- through purge_inactive_guests(); both remove children explicitly. Keeping
-- the constraint as RESTRICT means an accidental `delete from users` fails
-- loudly instead of silently erasing a player's whole history.
--
-- word_results_word_id_fkey is excluded on purpose: deleting a word must never
-- take player results with it.

COMMENT ON CONSTRAINT word_results_user_id_fkey ON public.word_results
  IS 'No ON DELETE CASCADE on purpose: deletion goes through delete_account() or purge_inactive_guests().';

COMMENT ON CONSTRAINT flagged_users_user_id_fkey ON public.flagged_users
  IS 'No ON DELETE CASCADE on purpose: deletion goes through delete_account() or purge_inactive_guests().';

COMMENT ON CONSTRAINT guesses_word_result_id_fkey ON public.guesses
  IS 'No ON DELETE CASCADE on purpose: guesses are removed together with their word_result.';
