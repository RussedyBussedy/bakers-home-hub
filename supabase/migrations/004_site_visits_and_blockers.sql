-- =====================================================================
--  Migration 004 — site-day log (contractor visits) and project blockers.
--  Paste into the Supabase SQL Editor and Run (after 003).
-- =====================================================================

-- What a project is stuck on, if anything. Independent of status.
alter table public.projects
  add column if not exists blocked_on text
    check (blocked_on in ('contractor', 'parts', 'decision', 'weather', 'payment', 'other')),
  add column if not exists blocked_note text not null default '',
  add column if not exists blocked_since date;

-- One row per expected or actual contractor visit.
create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  visit_date date not null default current_date,
  outcome text not null default 'scheduled'
    check (outcome in ('scheduled', 'arrived', 'partial', 'no_show', 'cancelled')),
  notes text not null default '',
  logged_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists site_visits_project_date on public.site_visits (project_id, visit_date desc);

alter table public.site_visits enable row level security;
drop policy if exists "site_visits: household all" on public.site_visits;
create policy "site_visits: household all" on public.site_visits
  for all to authenticated
  using (public.project_in_household(project_id))
  with check (public.project_in_household(project_id));

alter table public.site_visits replica identity full;
alter publication supabase_realtime add table public.site_visits;
