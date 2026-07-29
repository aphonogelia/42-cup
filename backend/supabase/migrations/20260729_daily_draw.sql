alter table words
  add column if not exists draw_date date;

-- Backfill existing rows so the current competition still works after the migration.
update words
set draw_date = coalesce(draw_date, (timezone('Europe/Berlin', now()))::date)
where draw_date is null;

-- The old schema used a global unique order_index. Daily draws need one order per day.
alter table words
  drop constraint if exists words_order_index_key;

alter table words
  alter column draw_date set not null;

create unique index if not exists words_draw_date_order_index_key
  on words (draw_date, order_index);