# Wordle // 42 Cup

![Wordle // 42 Cup screenshot placeholder](./docs/screenshot-placeholder.png)

Live app: https://wordle-sepia-nu.vercel.app

Wordle // 42 Cup is a Wordle-style game built for 42 students during the club immersion day. It lets players sign in with their 42 account, play through the daily word set, and compare results on the leaderboard.

The game is seeded with 5 randomly selected words from the repository word pool in [backend/data/competition-words.txt](backend/data/competition-words.txt). That pool currently contains about 1,849 words. Guess validation uses the Wordle allowed-guess list in [backend/data/guesses.txt](backend/data/guesses.txt), which contains about 14,853 entries.

## Stack

- Frontend: React + Vite, deployed on Vercel
- Backend: Fastify.js, deployed on Render
- Database: Supabase
- Authentication: 42 OAuth

## What it does

- Sign in with your 42 account
- Play the current daily draw of 5 words
- Submit only valid Wordle guesses
- Track progress and leaderboard results per day
- Keep past draws stored in the database

## How it works

- The backend selects 5 words at random from the competition pool for the active day.
- The answer word never reaches the client.
- The frontend only receives the word metadata and feedback for submitted guesses.
- Leaderboard results are computed from the stored game results in Supabase.

## Repository layout

```text
backend/
	src/        Fastify API, auth, game logic, and leaderboard routes
	data/       Competition word pool and allowed-guess list
	supabase/   Schema, views, and migration files

frontend/
	src/        React app, UI components, and styles
```

## Local development

See [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md) for the setup and deployment details.

## Notes

- The backend is hosted on Render.
- The frontend is hosted on Vercel.
- The database is hosted on Supabase.
- The app is designed for the 42 club immersion day, but it can be reused for other small Wordle competitions.

## License

This project is open source under the MIT License. See [LICENSE](LICENSE).