DROP VIEW IF EXISTS public.leaderboard_new;
DROP VIEW IF EXISTS public.leaderboard;

CREATE VIEW public.leaderboard
WITH (security_invoker = on)
AS
WITH active_users AS (
    SELECT DISTINCT
        wr.user_id,
        w.draw_date
    FROM public.word_results wr
    JOIN public.words w
        ON w.id = wr.word_id
)
SELECT
    u.id AS user_id,
    u.login,
    u.avatar_url,
    au.draw_date,
    count(*) FILTER (
        WHERE wr.status = 'solved'
    ) AS words_found,
    COALESCE(
        sum(wr.time_seconds) FILTER (
            WHERE wr.status = 'solved'
        ),
        0
    ) AS total_time,
    COALESCE(
        sum(wr.nb_tries) FILTER (
            WHERE wr.status = 'solved'
        ),
        0
    ) AS total_tries,
    array_agg(
        COALESCE(wr.status, 'not_started')
        ORDER BY w.order_index
    ) AS word_statuses
FROM active_users au
JOIN public.users u
    ON u.id = au.user_id
JOIN public.words w
    ON w.draw_date = au.draw_date
LEFT JOIN public.word_results wr
    ON wr.user_id = u.id
    AND wr.word_id = w.id
GROUP BY
    u.id,
    u.login,
    u.avatar_url,
    au.draw_date;

GRANT ALL ON public.leaderboard TO anon;
GRANT ALL ON public.leaderboard TO authenticated;
GRANT ALL ON public.leaderboard TO service_role;