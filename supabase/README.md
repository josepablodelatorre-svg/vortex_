# World leaderboard (Supabase)

The game posts each finished run to a `scores` table in Supabase and shows
the top 10 per mode on LEADERBOARD → WORLD. The free tier is plenty.

## One-time setup

1. Open the project at https://supabase.com/dashboard
   (`szwwqpfkaxrkgubjbtms`).
2. **SQL Editor → New query**, paste all of [`schema.sql`](schema.sql), **Run**.
   It creates the table, its limits, and the rules: anyone can read and add
   scores; nobody can edit or delete them through the game's key.
3. That's it. `src/online.js` already has the project URL and the
   publishable key (that key is designed to be public; the table's rules
   are what protect it).

## Looking after it

- **Rude names / obvious cheats:** Table Editor → `scores` → select rows →
  delete. Names are limited to 10 letters, numbers and `_.!?-`.
- **Scores are not cheat-proof:** they come from the player's browser. The
  table caps them (under 10,000,000) and only accepts today's date, which
  stops casual tampering, not a determined cheater. Server-side checks
  (an Edge Function replaying the run) would be the next step if needed.
- **Turning it off:** set `ONLINE.url` to `''` in `src/online.js`.
- Copies of the game run locally (tests, development, opened from disk)
  never post to the real board; tests use a local stand-in
  (`tests/scores-server.js`, `?scores=http://127.0.0.1:8790`).
