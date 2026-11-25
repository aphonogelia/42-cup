-- Scoped leaderboards: `42` (logins, unchanged) and `open` (opt-in, handles).
--
-- Object order matters, do not reorder:
--   1. users columns         nothing reads them yet
--   2. guest backfill        before the trigger, so the trigger is never involved
--   3. handle format CHECK   validates the backfilled rows too
--   4. unique index          lower(handle), partial
--   5. guest insert trigger  new guests get handle = login, opted in, no changed_at
--   6. leaderboard_open      NEW view; the existing `leaderboard` view is NOT touched
--   7. handle_available()    availability check, service role only
--   8. leaderboard_period()  8 -> 9 args, p_scope added
--
-- Deliberately not modified: public.leaderboard, public.user_rank_counts,
-- public.valid_results. The 42 Daily keeps reading `leaderboard` as before, so
-- nothing changes for 42 players before the backend is deployed.
--
-- Deploy order: this migration, then the backend, then the frontend.
--
-- p_scope is the LAST parameter because PostgreSQL requires parameters that have
-- a default to follow every parameter without one. The old 8-argument call (all
-- arguments passed by name) still resolves and takes the '42' default, so the
-- running backend keeps working between the migration and the backend deploy.


-- 1. Columns -------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS handle            text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS global_opt_in     boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS handle_changed_at timestamptz;


-- 2. Backfill: guests are always on the open board, under their guest login ------
-- handle_changed_at stays NULL on purpose: a guest's system-assigned default is
-- not a choice, so their first change is free, and setting it locks the handle
-- for good (handles are chosen once).
UPDATE public.users
SET handle        = login,
    global_opt_in = true
WHERE is_guest
  AND handle IS NULL;

-- Verified against the CHECK below: 'guest_' + 8 hex chars = 14 chars, all in
-- [a-z0-9_], and users.login is already globally unique, so no collisions.


-- 3. Handle format --------------------------------------------------------------
-- Guest logins are 'guest_' + 8 hex chars: any change to the guest login format
-- must keep fitting this CHECK, because the trigger below copies login into
-- handle on insert.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname  = 'users_handle_format'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_handle_format
      CHECK (handle IS NULL OR handle ~ '^[A-Za-z0-9_-]{3,16}$');
  END IF;
END
$$;


-- 4. Case-insensitive uniqueness -------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS users_handle_lower_uniq
  ON public.users (lower(handle))
  WHERE handle IS NOT NULL;


-- 5. Guest default handle --------------------------------------------------------
-- Closes the window between this migration and the backend deploy: the old
-- guest.js inserts with no handle and no opt-in, and the row still lands on the
-- open board. handle_changed_at is never touched here.
CREATE OR REPLACE FUNCTION public.users_guest_handle_default()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $function$
BEGIN
  IF NEW.is_guest AND NEW.handle IS NULL THEN
    NEW.handle        := NEW.login;
    NEW.global_opt_in := true;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.users_guest_handle_default() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS users_guest_handle ON public.users;

CREATE TRIGGER users_guest_handle
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.users_guest_handle_default();


-- 6. Open Daily board ------------------------------------------------------------
-- Same body as public.leaderboard, except:
--   * the `AND NOT u.is_guest` join predicate is gone
--   * handle, global_opt_in and is_guest are appended (appending is required:
--     a view cannot be reordered or have columns inserted in the middle)
-- The route reads this, filters `global_opt_in AND handle IS NOT NULL`, then
-- removes user_id, login and avatar_url before caching. Grants: service role only.
CREATE OR REPLACE VIEW public.leaderboard_open WITH (security_invoker = on) AS
SELECT u.id AS user_id,
       u.login,
       u.avatar_url,
       u.privacy_enabled,
       d.draw_date,
       count(*) FILTER (WHERE vr.status = 'solved') AS words_found,
       COALESCE(sum(vr.time_seconds) FILTER (WHERE vr.status = ANY (ARRAY['solved'::text, 'failed'::text])), (0)::numeric) AS total_time,
       COALESCE(sum(vr.nb_tries) FILTER (WHERE vr.status = ANY (ARRAY['solved'::text, 'failed'::text])), (0)::bigint) AS total_tries,
       array_agg(COALESCE(vr.status, 'not_started'::text) ORDER BY w.order_index) AS word_statuses,
       u.handle,
       u.global_opt_in,
       u.is_guest
FROM (SELECT DISTINCT user_id, draw_date FROM public.valid_results) d
JOIN public.users u ON u.id = d.user_id
JOIN public.words w ON w.draw_date = d.draw_date
LEFT JOIN public.valid_results vr ON vr.user_id = u.id AND vr.word_id = w.id
GROUP BY u.id, u.login, u.avatar_url, u.privacy_enabled, u.handle, u.global_opt_in, u.is_guest, d.draw_date;

REVOKE ALL ON public.leaderboard_open FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.leaderboard_open TO service_role;


-- 7. Handle availability -----------------------------------------------------------
-- One statement so the check cannot race with itself: format, another user's
-- handle (case-insensitive) and another user's intra login. The caller's own row
-- is excluded, so checking an unchanged handle or their own login returns true.
-- The insert/update still goes through the unique index; this is the friendly path.
CREATE OR REPLACE FUNCTION public.handle_available (p_handle text, p_user_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  AS $function$
  SELECT p_handle IS NOT NULL
     AND p_handle ~ '^[A-Za-z0-9_-]{3,16}$'
     AND NOT EXISTS (
       SELECT 1
       FROM public.users u
       WHERE u.id <> p_user_id
         AND (lower(u.handle) = lower(p_handle) OR lower(u.login) = lower(p_handle))
     )
$function$;

REVOKE ALL ON FUNCTION public.handle_available(text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.handle_available(text, uuid) TO service_role;


-- 8. Period boards with a scope ------------------------------------------------------
-- Same scoring and eligibility as before. Only the final filter and the extra
-- `handle` column change:
--   scope = 'open' -> opted in with a handle (guests are always opted in)
--   scope = '42'   -> 42 players only, as today
-- `handle` is only populated on open rows; `privacy_enabled` is returned for
-- both scopes, so 42 payloads gain one boolean and nothing else.
-- An unknown scope returns no rows on purpose: the route validates the value.
DROP FUNCTION IF EXISTS public.leaderboard_period(
  date, date, integer, numeric, numeric, integer, numeric, date
);

CREATE OR REPLACE FUNCTION public.leaderboard_period (
  p_from           date,
  p_to             date,
  p_min_days       integer,
  p_try_penalty    numeric,
  p_longevity_max  numeric,
  p_longevity_days integer,
  p_fail_weight    numeric,
  p_today          date,
  p_scope          text DEFAULT '42'
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
    qualified     boolean,
    handle        text,
    privacy_enabled boolean
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
    select vr.user_id, vr.draw_date
    from valid_results vr
    join day_totals dt on dt.draw_date = vr.draw_date
    group by vr.user_id, vr.draw_date, dt.total
    having count(*) = dt.total
  ),
  complete_day_counts as (
    select user_id, count(*)::int as days_complete
    from complete_days
    group by user_id
  ),
  agg as (
    select vr.user_id,
           coalesce(c.days_complete, 0) as days_complete,
           count(*)::int as words_started,
           count(*) filter (where vr.status = 'solved')::int as words_solved,
           avg(vr.nb_tries) filter (where vr.status = 'solved') as avg_tries,
           percentile_cont(0.5) within group (order by vr.time_seconds)
             filter (where vr.status = 'solved') as median_time,
           percentile_cont(0.5) within group (
             order by coalesce(vr.time_seconds, 0) + (vr.nb_tries - 1) * p_try_penalty)
             filter (where vr.status = 'solved') as median_cost
    from valid_results vr
    left join complete_day_counts c on c.user_id = vr.user_id
    where vr.status <> 'in_progress'
      and (p_from is null or vr.draw_date >= p_from)
      and (p_to is null or vr.draw_date <= p_to)
    group by vr.user_id, c.days_complete
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
         (a.days_complete >= p_min_days),
         case when p_scope = 'open' then u.handle end,
         u.privacy_enabled
  from agg a
  join users u on u.id = a.user_id
  where (p_scope = 'open' and u.global_opt_in and u.handle is not null)
     or (p_scope = '42'   and not u.is_guest)
$function$;

-- Same privileges as the function this migration replaces, on the new signature.
GRANT EXECUTE ON FUNCTION public.leaderboard_period(
  date, date, integer, numeric, numeric, integer, numeric, date, text
) TO PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.leaderboard_period(
  date, date, integer, numeric, numeric, integer, numeric, date, text
) FROM postgres;

GRANT EXECUTE ON FUNCTION public.leaderboard_period(
  date, date, integer, numeric, numeric, integer, numeric, date, text
) TO postgres;

GRANT EXECUTE ON FUNCTION public.leaderboard_period(
  date, date, integer, numeric, numeric, integer, numeric, date, text
) TO service_role;


-- 9. API schema cache -------------------------------------------------------------
-- PostgREST caches function signatures; without this the rpc call keeps hitting
-- the dropped 8-argument version until the cache expires.
NOTIFY pgrst, 'reload schema';
