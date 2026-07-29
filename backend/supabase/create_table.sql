-- 42 users
create table users (
  id uuid primary key default gen_random_uuid(),
  intra_id integer unique not null,
  login text unique not null,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- the competition's fixed word set (e.g. 7 words)
create table words (
  id serial primary key,
  order_index integer unique not null, -- 1..7
  answer text not null, -- kept server-side only, never sent to client
  length integer not null
);

-- one row per user per word: the authoritative result
create table word_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  word_id integer references words(id) not null,
  status text check (status in ('in_progress','solved','failed')) default 'in_progress',
  nb_tries integer default 0,
  started_at timestamptz default now(),
  solved_at timestamptz,
  time_seconds numeric generated always as (extract(epoch from (solved_at - started_at))) stored,
  unique(user_id, word_id)
);

-- every individual guess, for replay/audit/anti-cheat
create table guesses (
  id uuid primary key default gen_random_uuid(),
  word_result_id uuid references word_results(id) not null,
  guess text not null,
  feedback jsonb not null, -- e.g. ["correct","present","absent",...]
  created_at timestamptz default now()
);