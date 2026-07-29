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

### 3. Seed the words
`data/competition-words.txt` is your full word **pool** (one word per line;
blank lines and `#` comments ignored) — not the 7 answers directly. Put as
many words in there as you like.

```bash
npm run seed:words
```

This randomly draws 7 words from the pool (via Node's `crypto.randomInt`,
not `Math.random`) and writes them into the `words` table as the actual
competition answers. It's **not idempotent on purpose**: once players have
recorded progress (any row exists in `word_results`), re-running refuses to
touch the answers unless you pass `--force` — changing them mid-competition
would corrupt everyone's state.

```bash
node scripts/seed-words.js --force        # re-roll a fresh 7, overwriting
node scripts/seed-words.js --count 5      # competition of 5 words instead of 7
node scripts/seed-words.js data/other.txt # sample from a different pool file
```

The same `competition-words.txt` pool also doubles as the guess-validation
dictionary (see `src/lib/dictionary.js`) — one file, one source of truth,
guesses of the right length are accepted if they're in your pool.

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