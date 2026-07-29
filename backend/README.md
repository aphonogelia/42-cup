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
- Redirect URI: `http://localhost:3001/api/auth/42/callback` (match `FORTYTWO_CALLBACK_URL`)
- Copy the UID/Secret into `FORTYTWO_CLIENT_ID` / `FORTYTWO_CLIENT_SECRET`

### 2. Supabase
- `SUPABASE_URL`: project URL
- `SUPABASE_SERVICE_ROLE_KEY`: **service role** key (Settings -> API). Never expose this
  to any frontend code — it bypasses RLS entirely, which is exactly why only this
  backend should hold it.

### 3. Seed the words
Edit `data/competition-words.txt` — one word per line, in the order you want
them presented (line 1 = word 1, etc). Blank lines and `#` comments are
ignored. Then run:

```bash
npm run seed:words
```

This upserts each line into the `words` table by `order_index`, so it's safe
to re-run after editing a word (it updates that row rather than duplicating
it). Note: if you *remove* a line to shrink the list, the script won't delete
the now-orphaned row in Supabase — do that manually if it happens.

To use a different file: `node scripts/seed-words.js path/to/other-list.txt`

### 4. (Optional) guess dictionary
Drop a JSON array of valid lowercase words into `data/allowed-guesses.json`
to restrict guesses to real words, matching your competition's word lengths.
Leave it as `[]` to accept any guess of the correct length (permissive mode).

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
