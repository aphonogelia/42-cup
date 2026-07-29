# Wordle competition backend (Fastify)

Server-authoritative: the answer word never reaches the client, only
per-letter feedback (`correct` / `present` / `absent`). Timing and try counts
are computed from server timestamps, not trusted from the client.

## Setup

```bash
npm install
cp .env.example .env   # fill in the values, see below
```

### 1. 42 OAuth app
Register at https://profile.intra.42.fr/oauth/applications
- Redirect URI: `http://localhost:3000/api/auth/42/callback` (match `FORTYTWO_CALLBACK_URL`)
- Copy the UID/Secret into `FORTYTWO_CLIENT_ID` / `FORTYTWO_CLIENT_SECRET`

### 2. Supabase
- `SUPABASE_URL`: project URL
- `SUPABASE_SERVICE_ROLE_KEY`: **service role** key (Settings -> API). Never expose this
  to any frontend code — it bypasses RLS entirely, which is exactly why only this
  backend should hold it.

### 3. Database change for daily draws

Apply [supabase/migrations/20260729_daily_draw.sql](supabase/migrations/20260729_daily_draw.sql) in Supabase.
It adds `words.draw_date`, backfills existing rows, and replaces the old global
`order_index` uniqueness with a per-day unique key on `(draw_date, order_index)`.
That is what lets the competition store a new tirage every day while keeping past
draws in the database.

### 4. Seed the daily draw
`data/competition-words.txt` is your full word **pool** (one word per line;
blank lines and `#` comments ignored) — not the 7 answers directly. Put as
many words in there as you like.

```bash
npm run seed:words
```

This draws 7 words from the pool (via Node's `crypto.randomInt`, not
`Math.random`) and writes them into the `words` table for the active Berlin
date. The backend selects the current draw by `Europe/Berlin` calendar day,
so a new set becomes active at midnight Berlin time while older draws stay
stored in the database.

```bash
node scripts/seed-words.js --force               # overwrite today's draw
node scripts/seed-words.js --date 2026-07-29     # seed a specific Berlin date
node scripts/seed-words.js --count 5             # draw of 5 words instead of 7
node scripts/seed-words.js data/other.txt        # sample from a different pool file
```

The same `competition-words.txt` pool also doubles as the guess-validation
dictionary (see `src/lib/dictionary.js`) — one file, one source of truth,
guesses of the right length are accepted if they're in your pool.

### Database change required

The `words` table now needs a `draw_date` column so each day’s tirage can be
stored separately. Add it once in Supabase with a unique constraint on
`(draw_date, order_index)`.

```sql
alter table words
  add column if not exists draw_date date;

create unique index if not exists words_draw_date_order_index_key
  on words (draw_date, order_index);

-- After backfilling existing rows, enforce the constraint:
alter table words
  alter column draw_date set not null;
```

If your existing table already has rows, backfill their `draw_date` first before
making the column `not null` in production.

## Run

```bash
npm run dev     # local dev, auto-restart
npm start       # production
```

## Deploy (Render)

- New Web Service, connect the repo
- Build command: `npm install`
- Start command: `npm start`
- Add all `.env` vars in the Render dashboard
- Set `FORTYTWO_CALLBACK_URL` to `https://<your-render-domain>/api/auth/42/callback`
  and update the same redirect URI on the 42 OAuth app
- Set `FRONTEND_URL` to your deployed Vercel frontend URL, and `NODE_ENV=production`
  (this switches the session cookie to `Secure; SameSite=None`, required for the
  cross-domain Vercel <-> Render cookie to work)

## API summary

| Route | Auth | Description |
|---|---|---|
| `GET /api/auth/42` | - | Redirects to 42 login |
| `GET /api/auth/42/callback` | - | OAuth callback, sets session cookie |
| `POST /api/auth/logout` | - | Clears session |
| `GET /api/auth/me` | required | Current user profile |
| `GET /api/game/progress` | required | Status of all words for this user |
| `POST /api/game/start` | required | `{ order_index }` -> resumes/starts a word |
| `POST /api/game/guess` | required | `{ word_id, guess }` -> feedback + status |
| `GET /api/leaderboard` | - | Public leaderboard, ranked per tier |