select cron.schedule(
  'purge-old-guesses',
  '0 3 * * *',  -- 03:00 UTC daily — comfortably after Berlin midnight year-round
  $$
  delete from guesses
  where word_result_id in (
    select wr.id
    from word_results wr
    join words w on w.id = wr.word_id
    where w.draw_date < (now() at time zone 'Europe/Berlin')::date
  )
  $$
);