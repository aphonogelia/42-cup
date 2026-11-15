# wordel // 42 Cup

Daily word game: Fastify API + Supabase/Postgres, React frontends. The backend
is authoritative — answers never reach the browser until a word is finished.

## Layout

- `backend/` — Fastify API, game rules, daily draw, leaderboards.
- `frontend/` — player app (React 18 + Vite), deployed on Vercel.
- `stat/` — separate data-story site (React 19 + D3), reads only
  `GET /api/public/stats`. Its own Vercel project.
- `supabase/migrations/` — schema, views and RPCs. Source of truth for DB logic.

No npm workspaces. Each package has its own `node_modules`; run commands from
that directory. Root `npm install` only installs the Supabase CLI.

## Do not touch

- Bot/entropy code is work in progress: `backend/scripts/bot/`,
  `backend/scripts/entropy-bot.js`, `backend/scripts/test_guesses/`. Leave it
  alone unless the task is specifically about it.

## Commands

```bash
# backend
cd backend && npm install && cp .env.example .env
npm run dev            # node --watch src/server.js
npm run lint
npm run analyze:entropy -- --targets 3 --report /tmp/entropy.json

# frontends
cd frontend && npm install && npm run dev   # port 5173
npm run lint && npm run build

cd stat && npm install && npm run dev
npm run lint && npm run build
```

No test suite, no CI. Verification is `npm run lint` plus `npm run build` for
the two frontends.

## Runtime and env gotchas

- `config.js` defaults `PORT` to **3000**; `.env.example`, the READMEs and
  `VITE_API_URL` use the same value.
- Boot fails fast if `JWT_SECRET`, `FORTYTWO_CLIENT_ID/SECRET/CALLBACK_URL`,
  `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` are missing.
- CORS allowlist comes from `FRONTEND_URL` (comma-separated) plus
  `LEGACY_FRONTEND_URL`.
- Backend data paths are resolved from `import.meta.url`, so the API can start
  from any CWD. Scripts under `backend/scripts/` still resolve the paths they
  write from CWD.
- Boot immediately calls `ensureDailyDraw`; the DB must be migrated and the pool
  populated or startup fails.
- Auth is a **Bearer JWT in `localStorage`**, not a cookie. 42 OAuth redirects
  to `${FRONTEND_URL}/auth/callback#token=<jwt>`. Guest tokens last 365 days.
- Supabase service-role key stays backend-only. Never add it to either Vite app.
- 42 login mirrors avatars into the Supabase `avatars` bucket; mirror failures
  are logged and ignored (avatar stays null).

## Game/data invariants

- **5 words per day** (`DEFAULT_DRAW_COUNT`); cheat detection compares against
  that same constant. Day boundary is `Europe/Berlin`.
- Draw: `crypto.randomInt` sample from `data/competition-words.txt`, excluding
  answers within ±90 days. `data/special.json` overrides the pool per date;
  `oneOff` beats `recurring`. Rows are upserted on `(draw_date, order_index)`.
- Guess dictionary is **only** `backend/data/guesses.txt` — not the competition
  pool (backend README is wrong about this). Max 6 tries; hard mode is always on
  via `config.game.hardMode`.
- `frontend/public/guesses.txt` must stay byte-identical to
  `backend/data/guesses.txt`. There is no sync script; copy it manually.
- The winning/submitting path is the SQL `submit_guess` RPC: tries, timing and
  status are computed there. Don't reimplement them in JS around it.
- Leaderboard rules live only in `backend/src/lib/leaderboardConfig.js`. They are
  passed as explicit parameters to `leaderboard_period`; the SQL function has no
  defaults. The same thresholds are returned to the UI, which never hardcodes
  them.
- Eligibility is the `valid_results` view: flagged user-days removed, past
  `in_progress` counts as failed. Leaderboards, personal stats and public stats
  all read it.
- Public stats are precomputed nightly by pg_cron (`refresh_stats`) and read from
  `stats_cache`; the route does not compute. Today is excluded. To recompute a
  day, delete its `stats_daily` row and run `select refresh_stats()`.
- Guess history for today's words is hidden until the requester has finished
  all of today's words. Word-times and guess-history endpoints enforce privacy
  flags server-side; the daily ledger only exposes the flag and the UI hides it.

## Database workflow

Migrations are applied manually; the API never migrates.

```bash
npx supabase link --project-ref <ref>   # dev/prod refs are in supabase/.envsupa
npx supabase db push                    # apply local migrations
npx supabase db diff                    # generate a migration from local changes
npx supabase migration new <name>
```

Add a new migration instead of editing an applied one. `supabase/config.toml`
is the local-stack config, not deployment.
