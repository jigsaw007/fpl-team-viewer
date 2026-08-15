-- FPL Peek optional cloud sync schema
-- Run this once in Supabase > SQL Editor.
-- The browser only uses the Supabase publishable key. RLS keeps each user's data private.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  fpl_team_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Plan',
  source_team_id bigint,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plans_user_updated_idx on public.plans(user_id, updated_at desc);

alter table public.profiles enable row level security;
alter table public.plans enable row level security;

-- Remove policies cleanly if you re-run this file.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;
drop policy if exists "plans_select_own" on public.plans;
drop policy if exists "plans_insert_own" on public.plans;
drop policy if exists "plans_update_own" on public.plans;
drop policy if exists "plans_delete_own" on public.plans;

create policy "profiles_select_own" on public.profiles
for select to authenticated
using ((select auth.uid()) = id);

create policy "profiles_insert_own" on public.profiles
for insert to authenticated
with check ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "profiles_delete_own" on public.profiles
for delete to authenticated
using ((select auth.uid()) = id);

create policy "plans_select_own" on public.plans
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "plans_insert_own" on public.plans
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "plans_update_own" on public.plans
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "plans_delete_own" on public.plans
for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.profiles from anon;
revoke all on public.plans from anon;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.plans to authenticated;
