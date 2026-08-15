-- Run this once in the Supabase SQL editor.

create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  team_id text,
  created_at timestamptz not null default now(),
  unsubscribed boolean not null default false,
  unsub_token uuid not null default gen_random_uuid(),
  last_notified_event int
);

-- Keep the API from reading the whole list publicly.
alter table subscribers enable row level security;
-- No public policies: only the service_role key (used server-side in the
-- Netlify functions) can read/write. Do NOT expose the service_role key client-side.
