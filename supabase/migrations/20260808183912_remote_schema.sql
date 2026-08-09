-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;


CREATE EXTENSION pg_cron WITH SCHEMA pg_catalog;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

CREATE SEQUENCE public.words_id_seq AS integer;

CREATE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;

GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;

GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;

CREATE TABLE public.guesses (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  word_result_id uuid                     NOT NULL,
  guess          text                     NOT NULL,
  feedback       jsonb                    NOT NULL,
  created_at     timestamp with time zone DEFAULT now()
);

ALTER TABLE public.guesses
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.guesses
  ADD CONSTRAINT guesses_pkey PRIMARY KEY (id);

GRANT ALL ON public.guesses TO anon;

GRANT ALL ON public.guesses TO authenticated;

GRANT ALL ON public.guesses TO service_role;

CREATE TABLE public.users (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  intra_id     integer                  NOT NULL,
  login        text                     NOT NULL,
  display_name text,
  avatar_url   text,
  created_at   timestamp with time zone DEFAULT now()
);

ALTER TABLE public.users
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.users
  ADD CONSTRAINT users_intra_id_key UNIQUE (intra_id);

ALTER TABLE public.users
  ADD CONSTRAINT users_login_key UNIQUE (LOGIN);

ALTER TABLE public.users
  ADD CONSTRAINT users_pkey PRIMARY KEY (id);

GRANT ALL ON public.users TO anon;

GRANT ALL ON public.users TO authenticated;

GRANT ALL ON public.users TO service_role;

CREATE TABLE public.word_results (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id      uuid                     NOT NULL,
  word_id      integer                  NOT NULL,
  status       text                     DEFAULT 'in_progress'::text,
  nb_tries     integer                  DEFAULT 0,
  started_at   timestamp with time zone DEFAULT now(),
  solved_at    timestamp with time zone,
  time_seconds numeric                  GENERATED ALWAYS AS (EXTRACT(epoch FROM (solved_at - started_at))) STORED
);

ALTER TABLE public.word_results
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.word_results
  ADD CONSTRAINT word_results_pkey PRIMARY KEY (id);

ALTER TABLE public.guesses
  ADD CONSTRAINT guesses_word_result_id_fkey FOREIGN KEY (word_result_id) REFERENCES public.word_results(id);

ALTER TABLE public.word_results
  ADD CONSTRAINT word_results_status_check CHECK (status = ANY (ARRAY['in_progress'::text, 'solved'::text, 'failed'::text]));

ALTER TABLE public.word_results
  ADD CONSTRAINT word_results_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE public.word_results
  ADD CONSTRAINT word_results_user_id_word_id_key UNIQUE (user_id, word_id);

GRANT ALL ON public.word_results TO anon;

GRANT ALL ON public.word_results TO authenticated;

GRANT ALL ON public.word_results TO service_role;

CREATE TABLE public.words (
  id          integer DEFAULT nextval('public.words_id_seq'::regclass) NOT NULL,
  order_index integer NOT NULL,
  answer      text    NOT NULL,
  length      integer NOT NULL,
  draw_date   date    NOT NULL
);

ALTER SEQUENCE public.words_id_seq OWNED BY public.words.id;

GRANT ALL ON SEQUENCE public.words_id_seq TO anon;

GRANT ALL ON SEQUENCE public.words_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.words_id_seq TO service_role;

ALTER TABLE public.words
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.words
  ADD CONSTRAINT words_pkey PRIMARY KEY (id);

ALTER TABLE public.word_results
  ADD CONSTRAINT word_results_word_id_fkey FOREIGN KEY (word_id) REFERENCES public.words(id);

GRANT ALL ON public.words TO anon;

GRANT ALL ON public.words TO authenticated;

GRANT ALL ON public.words TO service_role;

CREATE UNIQUE INDEX words_draw_date_order_index_key ON public.words (draw_date, order_index);

CREATE VIEW public.leaderboard AS WITH active_users AS (
         SELECT DISTINCT wr.user_id,
            w.draw_date
           FROM (public.word_results wr
             JOIN public.words w ON ((w.id = wr.word_id)))
          WHERE (wr.nb_tries > 0)
        )
 SELECT u.id AS user_id,
    u.login,
    u.avatar_url,
    au.draw_date,
    count(*) FILTER (WHERE (wr.status = 'solved'::text)) AS words_found,
    COALESCE(sum(wr.time_seconds) FILTER (WHERE (wr.status = ANY (ARRAY['solved'::text, 'failed'::text]))), (0)::numeric) AS total_time,
    COALESCE(sum(wr.nb_tries) FILTER (WHERE (wr.status = ANY (ARRAY['solved'::text, 'failed'::text]))), (0)::bigint) AS total_tries,
    array_agg(COALESCE(wr.status, 'not_started'::text) ORDER BY w.order_index) AS word_statuses
   FROM (((active_users au
     JOIN public.users u ON ((u.id = au.user_id)))
     JOIN public.words w ON ((w.draw_date = au.draw_date)))
     LEFT JOIN public.word_results wr ON (((wr.user_id = u.id) AND (wr.word_id = w.id))))
  WHERE ((wr.id IS NOT NULL) AND (wr.nb_tries > 0))
  GROUP BY u.id, u.login, u.avatar_url, au.draw_date;

GRANT ALL ON public.leaderboard TO anon;

GRANT ALL ON public.leaderboard TO authenticated;

GRANT ALL ON public.leaderboard TO service_role;

CREATE VIEW public.leaderboard_new AS WITH active_users AS (
         SELECT DISTINCT wr_1.user_id,
            w_1.draw_date
           FROM (public.word_results wr_1
             JOIN public.words w_1 ON ((w_1.id = wr_1.word_id)))
          WHERE (wr_1.nb_tries > 0)
        )
 SELECT u.id AS user_id,
    u.login,
    u.avatar_url,
    au.draw_date,
    count(*) FILTER (WHERE (wr.status = 'solved'::text)) AS words_found,
    COALESCE(sum(wr.time_seconds) FILTER (WHERE (wr.status = ANY (ARRAY['solved'::text, 'failed'::text]))), (0)::numeric) AS total_time,
    COALESCE(sum(wr.nb_tries) FILTER (WHERE (wr.status = ANY (ARRAY['solved'::text, 'failed'::text]))), (0)::bigint) AS total_tries,
    array_agg(COALESCE(wr.status, 'not_started'::text) ORDER BY w.order_index) AS word_statuses
   FROM (((active_users au
     JOIN public.users u ON ((u.id = au.user_id)))
     JOIN public.words w ON ((w.draw_date = au.draw_date)))
     LEFT JOIN public.word_results wr ON (((wr.user_id = u.id) AND (wr.word_id = w.id))))
  WHERE ((wr.nb_tries > 0) OR (wr.id IS NULL))
  GROUP BY u.id, u.login, u.avatar_url, au.draw_date;

GRANT ALL ON public.leaderboard_new TO anon;

GRANT ALL ON public.leaderboard_new TO authenticated;

GRANT ALL ON public.leaderboard_new TO service_role;

CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();
