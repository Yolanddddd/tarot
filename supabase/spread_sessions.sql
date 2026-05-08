create extension if not exists pgcrypto;

create table if not exists public.spread_sessions (
  id uuid primary key,
  created_at timestamptz not null default timezone('utc', now()),
  spread_id text not null,
  spread_label text not null,
  card_count integer not null check (card_count > 0 and card_count <= 78),
  revealed_at timestamptz not null,
  payload jsonb not null
);

create index if not exists spread_sessions_revealed_at_idx
  on public.spread_sessions (revealed_at desc);

alter table public.spread_sessions enable row level security;

grant select, insert on public.spread_sessions to anon, authenticated;

drop policy if exists "spread_sessions_public_read" on public.spread_sessions;
create policy "spread_sessions_public_read"
  on public.spread_sessions
  for select
  to anon, authenticated
  using (true);

drop policy if exists "spread_sessions_public_insert" on public.spread_sessions;
create policy "spread_sessions_public_insert"
  on public.spread_sessions
  for insert
  to anon, authenticated
  with check (true);
