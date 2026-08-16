-- FPL Peek Insights / Editorial Studio
-- Run this ONCE in Supabase > SQL Editor after the original setup.sql.

create table if not exists public.articles (
  id uuid primary key,
  slug text not null unique,
  title text not null,
  excerpt text not null default '',
  content text not null default '',
  category text not null default 'opinion',
  gameweek integer check (gameweek is null or (gameweek between 1 and 38)),
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists articles_status_published_idx on public.articles(status, published_at desc);
create index if not exists articles_gameweek_idx on public.articles(gameweek);

alter table public.articles enable row level security;

drop policy if exists "articles_public_read_published" on public.articles;
drop policy if exists "articles_admin_read_all" on public.articles;
drop policy if exists "articles_admin_insert" on public.articles;
drop policy if exists "articles_admin_update" on public.articles;
drop policy if exists "articles_admin_delete" on public.articles;

create policy "articles_public_read_published" on public.articles
for select to anon, authenticated
using (status = 'published');

-- The browser only shows the studio to this account; these RLS policies are the real security boundary.
create policy "articles_admin_read_all" on public.articles
for select to authenticated
using ((select auth.jwt() ->> 'email') = 'account@fplpeek.com');

create policy "articles_admin_insert" on public.articles
for insert to authenticated
with check ((select auth.jwt() ->> 'email') = 'account@fplpeek.com');

create policy "articles_admin_update" on public.articles
for update to authenticated
using ((select auth.jwt() ->> 'email') = 'account@fplpeek.com')
with check ((select auth.jwt() ->> 'email') = 'account@fplpeek.com');

create policy "articles_admin_delete" on public.articles
for delete to authenticated
using ((select auth.jwt() ->> 'email') = 'account@fplpeek.com');

grant select on public.articles to anon;
grant select, insert, update, delete on public.articles to authenticated;
