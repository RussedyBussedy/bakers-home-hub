-- =====================================================================
--  The Bakers' Home Hub — Supabase schema
--  Paste this whole file into the Supabase SQL Editor and click "Run".
--  It is safe to run once on a fresh project.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Household + profiles
-- ---------------------------------------------------------------------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our Home',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  display_name text not null,
  color text not null default '#B84D24',
  created_at timestamptz not null default now()
);

-- The one household everyone who signs in belongs to.
insert into public.households (id, name)
values ('00000000-0000-0000-0000-000000000001', 'The Bakers');

-- Which household does the signed-in user belong to?
create or replace function public.current_household_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select household_id from public.profiles where id = auth.uid()
$$;

-- Every new auth user automatically gets a profile in the household.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  n int;
  nm text;
begin
  select count(*) into n from public.profiles;
  nm := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    initcap(replace(replace(split_part(new.email, '@', 1), '.', ' '), '_', ' '))
  );
  insert into public.profiles (id, household_id, display_name, color)
  values (
    new.id,
    '00000000-0000-0000-0000-000000000001',
    nm,
    case when n = 0 then '#B84D24' when n = 1 then '#7F5A9E' else '#4F7291' end
  )
  on conflict (id) do nothing;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Back-fill profiles for users created before this script ran.
insert into public.profiles (id, household_id, display_name, color)
select
  u.id,
  '00000000-0000-0000-0000-000000000001',
  initcap(replace(replace(split_part(u.email, '@', 1), '.', ' '), '_', ' ')),
  case when row_number() over (order by u.created_at) = 1 then '#B84D24' else '#7F5A9E' end
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Projects and everything hanging off them
-- ---------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null,
  description text not null default '',
  room text not null default '',
  category text not null default '',
  status text not null default 'idea' check (status in ('idea', 'planning', 'in_progress', 'done', 'on_hold')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  budget_estimate numeric(12, 2) not null default 0,
  cover_path text,
  accent text not null default '#B84D24',
  start_date date,
  target_date date,
  completed_date date,
  sort_order int not null default 0,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.projects (household_id, updated_at desc);

create table public.project_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  path text not null,
  caption text not null default '',
  kind text not null default 'space' check (kind in ('before', 'space', 'after', 'other')),
  width int,
  height int,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index on public.project_images (project_id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  company text not null default '',
  role text not null default 'contractor' check (role in ('contractor', 'supplier', 'designer', 'other')),
  phone text not null default '',
  email text not null default '',
  whatsapp text not null default '',
  notes text not null default '',
  rating int check (rating between 1 and 5),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index on public.contacts (household_id, name);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  title text not null default '',
  amount numeric(12, 2) not null default 0,
  vat_included boolean not null default true,
  status text not null default 'received' check (status in ('received', 'accepted', 'rejected', 'paid')),
  quote_date date,
  valid_until date,
  file_path text,
  notes text not null default '',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index on public.quotes (project_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  amount numeric(12, 2) not null default 0,
  date date not null default current_date,
  category text not null default 'Materials',
  contact_id uuid references public.contacts (id) on delete set null,
  receipt_path text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index on public.expenses (project_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  due_date date,
  assigned_to uuid references auth.users (id) on delete set null,
  sort_order int not null default 0,
  completed_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index on public.tasks (project_id, sort_order);

-- Inspiration boards: one row per pin (photo, colour, note, link, product, label)
create table public.board_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  type text not null check (type in ('photo', 'color', 'note', 'link', 'product', 'label')),
  x double precision not null default 0,
  y double precision not null default 0,
  w double precision not null default 240,
  h double precision not null default 240,
  rotation double precision not null default 0,
  z int not null default 1,
  data jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.board_items (project_id, z);

-- The game
create table public.xp_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  points int not null default 0,
  project_id uuid references public.projects (id) on delete set null,
  ref_id text,
  created_at timestamptz not null default now()
);
create index on public.xp_events (household_id, created_at);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  key text not null,
  unlocked_at timestamptz not null default now(),
  unique (household_id, key)
);

-- Keep updated_at honest
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger projects_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger board_items_updated_at before update on public.board_items for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Row-level security: only members of the household see or touch its data
-- ---------------------------------------------------------------------
create or replace function public.project_in_household(pid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = pid and p.household_id = public.current_household_id()
  )
$$;

alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_images enable row level security;
alter table public.contacts enable row level security;
alter table public.quotes enable row level security;
alter table public.expenses enable row level security;
alter table public.tasks enable row level security;
alter table public.board_items enable row level security;
alter table public.xp_events enable row level security;
alter table public.achievements enable row level security;

create policy "household: members read" on public.households
  for select to authenticated using (id = public.current_household_id());
create policy "household: members update" on public.households
  for update to authenticated using (id = public.current_household_id());

create policy "profiles: household read" on public.profiles
  for select to authenticated using (household_id = public.current_household_id());
create policy "profiles: own update" on public.profiles
  for update to authenticated using (id = auth.uid());

create policy "projects: household all" on public.projects
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy "images: household all" on public.project_images
  for all to authenticated
  using (public.project_in_household(project_id))
  with check (public.project_in_household(project_id));

create policy "contacts: household all" on public.contacts
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy "quotes: household all" on public.quotes
  for all to authenticated
  using (public.project_in_household(project_id))
  with check (public.project_in_household(project_id));

create policy "expenses: household all" on public.expenses
  for all to authenticated
  using (public.project_in_household(project_id))
  with check (public.project_in_household(project_id));

create policy "tasks: household all" on public.tasks
  for all to authenticated
  using (public.project_in_household(project_id))
  with check (public.project_in_household(project_id));

create policy "board: household all" on public.board_items
  for all to authenticated
  using (public.project_in_household(project_id))
  with check (public.project_in_household(project_id));

create policy "xp: household all" on public.xp_events
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy "achievements: household all" on public.achievements
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

-- ---------------------------------------------------------------------
-- Storage: a private "media" bucket, files live under <household_id>/...
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 26214400, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;

create policy "media: household read" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = public.current_household_id()::text);
create policy "media: household insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = public.current_household_id()::text);
create policy "media: household update" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = public.current_household_id()::text);
create policy "media: household delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = public.current_household_id()::text);

-- ---------------------------------------------------------------------
-- Realtime: broadcast row changes so both phones stay in sync
-- ---------------------------------------------------------------------
alter table public.projects replica identity full;
alter table public.project_images replica identity full;
alter table public.contacts replica identity full;
alter table public.quotes replica identity full;
alter table public.expenses replica identity full;
alter table public.tasks replica identity full;
alter table public.board_items replica identity full;
alter table public.xp_events replica identity full;
alter table public.achievements replica identity full;
alter table public.profiles replica identity full;

alter publication supabase_realtime add table
  public.projects, public.project_images, public.contacts, public.quotes, public.expenses,
  public.tasks, public.board_items, public.xp_events, public.achievements, public.profiles;

-- Done. Next: Authentication → Users → "Add user" for each of you (tick auto-confirm).
