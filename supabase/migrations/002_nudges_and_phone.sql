-- =====================================================================
--  Migration 002 — nudges (in-app notifications), WhatsApp numbers on
--  profiles, and letting household members tidy each other's names.
--  Paste into the Supabase SQL Editor and Run (after schema.sql).
-- =====================================================================

-- WhatsApp / phone number per person, used by the Share and Nudge buttons.
alter table public.profiles add column if not exists phone text not null default '';

-- Either person may edit either profile (a couple's app — handy for fixing names).
drop policy if exists "profiles: own update" on public.profiles;
drop policy if exists "profiles: household update" on public.profiles;
create policy "profiles: household update" on public.profiles
  for update to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

-- Nudges: "please do this", "I did this", "FYI" — delivered in-app in real time.
create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid references auth.users (id) on delete cascade,
  kind text not null default 'fyi' check (kind in ('todo', 'done', 'fyi')),
  message text not null,
  project_id uuid references public.projects (id) on delete cascade,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists nudges_household_created on public.nudges (household_id, created_at desc);

alter table public.nudges enable row level security;
drop policy if exists "nudges: household all" on public.nudges;
create policy "nudges: household all" on public.nudges
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

alter table public.nudges replica identity full;
alter publication supabase_realtime add table public.nudges;
