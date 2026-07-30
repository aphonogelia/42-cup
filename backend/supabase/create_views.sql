create or replace view public.leaderboard
with (security_invoker = on)
as
select
  u.id as user_id,
  u.login,
  u.avatar_url,
  w.draw_date,
  count(*) filter (where wr.status = 'solved') as words_found,
  coalesce(sum(wr.time_seconds) filter (where wr.status = 'solved'), 0) as total_time,
  coalesce(sum(wr.nb_tries) filter (where wr.status = 'solved'), 0) as total_tries
from users u
join word_results wr on wr.user_id = u.id
join words w on w.id = wr.word_id
group by u.id, u.login, u.avatar_url, w.draw_date;