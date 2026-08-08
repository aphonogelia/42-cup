create or replace view public.leaderboard
with (security_invoker = on)
as
with active_users as (
  select distinct wr.user_id, w.draw_date
  from word_results wr
  join words w on w.id = wr.word_id
)
select
  u.id as user_id,
  u.login,
  u.avatar_url,
  w.draw_date,
  count(*) filter (where wr.status = 'solved') as words_found,
  coalesce(sum(wr.time_seconds) filter (where wr.status = 'solved'), 0) as total_time,
  coalesce(sum(wr.nb_tries) filter (where wr.status = 'solved'), 0) as total_tries,
  array_agg(coalesce(wr.status, 'not_started') order by w.order_index) as word_statuses
from active_users au
join users u on u.id = au.user_id
join words w on w.draw_date = au.draw_date
left join word_results wr on wr.user_id = u.id and wr.word_id = w.id
group by u.id, u.login, u.avatar_url, w.draw_date;