-- Zen Kitchen — solo cloud snapshot sync
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query).

create table if not exists public.kitchen_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  revision bigint not null,
  updated_at timestamptz not null default now(),
  payload jsonb not null,
  device_id text
);

alter table public.kitchen_snapshots enable row level security;

drop policy if exists "Users manage own kitchen snapshot" on public.kitchen_snapshots;

create policy "Users manage own kitchen snapshot"
  on public.kitchen_snapshots
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
