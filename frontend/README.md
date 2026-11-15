# wordel competition frontend (React + Vite)

Talks to the Fastify backend with a bearer JWT stored in `localStorage` (see
`TOKEN_KEY` in `src/api.js`). The 42 OAuth callback lands on
`/auth/callback#token=<jwt>`, where `AuthCallback.jsx` stores it and redirects
home. The backend sends no session cookie.

## Setup

```bash
npm install
cp .env.example .env   # point VITE_API_URL at your backend
npm run dev
```

Requires the backend running (see the `wordel-backend` README) with
`FRONTEND_URL` there set to match wherever this dev server runs
(`http://localhost:5173` by default).

## Structure

```
public/
└── guesses.txt          # client-side copy of backend/data/guesses.txt

src/
├── App.jsx              # auth check, manual pathname handling, view switching
├── api.js               # fetch wrapper, adds the bearer token from localStorage
├── index.css            # design tokens + all styles
├── lib/                 # time formatting, guess dictionary, keyboard state
└── components/
    ├── Login.jsx / AuthCallback.jsx / LoginRequired.jsx
    ├── WordTabs.jsx       # the 5 words as punch-card ticket stubs
    ├── Game.jsx           # per-word state, guess submission, keyboard input
    ├── GameGrid.jsx       # the tile grid
    ├── Keyboard.jsx       # on-screen keyboard
    ├── Stats.jsx          # personal statistics
    ├── Leaderboard.jsx    # tiered daily ledger (5/5 first, then 4/5, ...)
    └── PeriodLeaderboard.jsx  # monthly and all-time boards
```

The frontend uses `public/guesses.txt` for immediate local guess feedback. The
backend remains authoritative and validates every submitted guess. Keep the
public copy byte-identical to `backend/data/guesses.txt`; there is no sync
script.

## Design

Ink-ledger / punch-card aesthetic — monospace throughout (JetBrains Mono for
display, IBM Plex Mono for body/data), dark navy background, amber/crimson
ink accents. The 5 competition words are shown as ticket-stub tabs that get
rubber-stamped SOLVED or FAILED as you finish them — that's the one signature
element; everything else stays quiet on purpose.

## One thing worth knowing: word order isn't enforced

The frontend defaults to opening your first unfinished word, but nothing
stops a player from clicking any tab and calling `/api/game/start` for a
later word before finishing an earlier one — **the backend doesn't block
this either**. If strict in-order play matters for your competition rules,
that needs enforcing server-side in `POST /api/game/start` (reject starting
word N+1 until word N has status `solved` or `failed`), since a determined
player could hit the API directly regardless of what the UI allows.

## Deploy (Vercel)

- New Project, framework preset: Vite
- Build command: `npm run build`, output dir: `dist`
- Env var: `VITE_API_URL` = your deployed backend URL (e.g. Render)
- Update the backend's `FRONTEND_URL` to match this deployed URL, and
  re-register a matching 42 OAuth redirect if needed