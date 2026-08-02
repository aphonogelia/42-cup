-- =====================================================================
-- Users
-- =====================================================================

create table users (
  id uuid primary key default gen_random_uuid(),
  intra_id integer unique not null,
  login text unique not null,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- =====================================================================
-- Daily words
-- =====================================================================

create table words (
  id serial primary key,
  order_index integer not null,
  answer text not null,
  length integer not null,
  draw_date date not null
);

create unique index words_draw_date_order_index_key
  on words (draw_date, order_index);

-- =====================================================================
-- User progress
-- =====================================================================

create table word_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  word_id integer not null references words(id),

  status text not null
    default 'in_progress'
    check (status in ('in_progress', 'solved', 'failed')),

  nb_tries integer not null default 0,

  started_at timestamptz not null default now(),
  solved_at timestamptz,

  time_seconds numeric
    generated always as (
      extract(epoch from (solved_at - started_at))
    ) stored,

  unique (user_id, word_id)
);

-- =====================================================================
-- Guess history
-- =====================================================================

create table guesses (
  id uuid primary key default gen_random_uuid(),
  word_result_id uuid not null references word_results(id),
  guess text not null,
  feedback jsonb not null,
  created_at timestamptz default now()
);