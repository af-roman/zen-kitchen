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

-- One-time sign-in handoff from Safari to the iPhone home screen app.
-- Those two copies do not share cookies or local storage. The browser that
-- opens the magic link stores a short-lived code here; the home screen app
-- claims it and exchanges it. Safe to re-run.
create table if not exists public.auth_handoffs (
  id uuid primary key,
  code text,
  flow_id text,
  access_token text,
  refresh_token text,
  created_at timestamptz not null default now(),
  constraint auth_handoffs_payload check (
    code is not null
    or (access_token is not null and refresh_token is not null)
  )
);

alter table public.auth_handoffs enable row level security;

drop policy if exists "Insert auth handoff" on public.auth_handoffs;
create policy "Insert auth handoff"
  on public.auth_handoffs
  for insert
  to anon, authenticated
  with check (true);

grant insert on table public.auth_handoffs to anon, authenticated;
revoke select, update, delete on table public.auth_handoffs from anon, authenticated;

create or replace function public.claim_auth_handoff(handoff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.auth_handoffs;
begin
  delete from public.auth_handoffs
  where created_at < now() - interval '15 minutes';

  delete from public.auth_handoffs
  where id = handoff_id
    and created_at > now() - interval '15 minutes'
  returning * into row;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'code', row.code,
    'flow_id', row.flow_id,
    'access_token', row.access_token,
    'refresh_token', row.refresh_token
  );
end;
$$;

revoke all on function public.claim_auth_handoff(uuid) from public;
grant execute on function public.claim_auth_handoff(uuid) to anon, authenticated;
