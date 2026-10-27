-- VORTEX online leaderboard. Run this once in the Supabase dashboard:
-- SQL Editor -> New query -> paste -> Run.
--
-- One table of scores. Anyone can read it and add to it (the game uses the
-- public "publishable" key); nobody can edit or delete through the API, so
-- entries can't be tampered with. You can still delete rows (e.g. rude
-- names) from the dashboard's Table Editor.

create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  mode       text not null check (mode in ('campaign', 'rift', 'daily')),
  day        date not null,                      -- the player's local date (daily board)
  name       text not null check (char_length(name) between 1 and 10 and name ~ '^[A-Z0-9 _.!?-]+$'),
  score      integer not null check (score > 0 and score < 10000000),
  reach      text not null check (char_length(reach) between 1 and 8),
  rank       text not null check (rank in ('S', 'A', 'B', 'C', 'D')),
  ship       text not null check (char_length(ship) between 1 and 12),
  version    text check (char_length(version) <= 12)
);

create index if not exists scores_mode_score on public.scores (mode, score desc);
create index if not exists scores_daily on public.scores (mode, day, score desc);

alter table public.scores enable row level security;

drop policy if exists "read scores" on public.scores;
create policy "read scores" on public.scores
  for select to anon, authenticated using (true);

-- new scores only, dated today (give or take a day for time zones)
drop policy if exists "add scores" on public.scores;
create policy "add scores" on public.scores
  for insert to anon, authenticated
  with check (day between (now() at time zone 'utc')::date - 1 and (now() at time zone 'utc')::date + 1);

grant select, insert on public.scores to anon, authenticated;
