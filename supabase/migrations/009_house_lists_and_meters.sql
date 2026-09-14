-- =====================================================================
--  Migration 009 — the house itself: a shared shopping list, a household
--  to-do list, and meter readings / prepaid top-ups.
--
--  Everything here belongs to the HOME, not to a project: the jobs and the
--  buying that happen whether or not anything is being renovated.
--  Paste into the Supabase SQL Editor and Run (after 008).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Shopping list — one running list for the home.
-- `assigned_to` null means nobody in particular: anyone can grab it.
-- ---------------------------------------------------------------------
create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null,
  qty text not null default '',
  category text not null default 'Groceries',
  notes text not null default '',
  /** Roughly what it costs — for the running total, never a commitment. */
  est_price numeric(12, 2),
  done boolean not null default false,
  assigned_to uuid references auth.users (id) on delete set null,
  /** Who actually ticked it off, so the list can say "Kay got this". */
  done_by uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  sort_order int not null default 0,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists shopping_items_household on public.shopping_items (household_id, done, sort_order);

-- ---------------------------------------------------------------------
-- Household to-do — jobs that fall outside any project.
-- Same principle: assigned to one of you, or open to whoever gets there first.
-- ---------------------------------------------------------------------
create table if not exists public.house_tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null,
  notes text not null default '',
  done boolean not null default false,
  due_date date,
  /** How often it comes back around, in days. Null for a one-off. */
  repeat_days int,
  assigned_to uuid references auth.users (id) on delete set null,
  done_by uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  sort_order int not null default 0,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists house_tasks_household on public.house_tasks (household_id, done, sort_order);

-- ---------------------------------------------------------------------
-- Meter readings — a dated number off a meter face, with the photo that
-- proves it. Water is the cumulative total the council bills against;
-- electricity is the units LEFT on the prepaid meter.
-- ---------------------------------------------------------------------
create table if not exists public.meter_readings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  utility text not null default 'water' check (utility in ('water', 'electricity')),
  /** Water: kilolitres on the dial. Electricity: kWh remaining. */
  reading numeric(14, 3) not null,
  read_on date not null default current_date,
  /** The photo of the meter face — the whole point of the evidence pack. */
  photo_path text,
  /** Read off the meter by us, or a figure the council put on a statement. */
  source text not null default 'self' check (source in ('self', 'council', 'estimate')),
  notes text not null default '',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists meter_readings_household on public.meter_readings (household_id, utility, read_on desc);

-- ---------------------------------------------------------------------
-- Prepaid top-ups — what was paid and what arrived on the meter.
-- The rand-per-unit of each one falls out of the two together, which is how
-- a monthly service fee shows itself without anyone having to model it.
-- ---------------------------------------------------------------------
create table if not exists public.utility_purchases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  utility text not null default 'electricity' check (utility in ('water', 'electricity')),
  bought_on date not null default current_date,
  /** What left the bank. */
  amount numeric(12, 2) not null default 0,
  /** What landed on the meter. */
  units numeric(14, 3) not null default 0,
  token text not null default '',
  notes text not null default '',
  receipt_path text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists utility_purchases_household on public.utility_purchases (household_id, utility, bought_on desc);

-- ---------------------------------------------------------------------
-- The home's own meter details, so a reading knows what it is reading and
-- the evidence pack can name the meter the council is billing.
-- ---------------------------------------------------------------------
alter table public.households
  add column if not exists water_meter_no text not null default '',
  add column if not exists electricity_meter_no text not null default '',
  add column if not exists municipal_account text not null default '',
  add column if not exists address text not null default '';

-- ---------------------------------------------------------------------
-- RLS — everything in the home, for everyone in the home.
-- ---------------------------------------------------------------------
alter table public.shopping_items enable row level security;
alter table public.house_tasks enable row level security;
alter table public.meter_readings enable row level security;
alter table public.utility_purchases enable row level security;

drop policy if exists "shopping_items: household all" on public.shopping_items;
create policy "shopping_items: household all" on public.shopping_items
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

drop policy if exists "house_tasks: household all" on public.house_tasks;
create policy "house_tasks: household all" on public.house_tasks
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

drop policy if exists "meter_readings: household all" on public.meter_readings;
create policy "meter_readings: household all" on public.meter_readings
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

drop policy if exists "utility_purchases: household all" on public.utility_purchases;
create policy "utility_purchases: household all" on public.utility_purchases
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

-- ---------------------------------------------------------------------
-- Realtime — a tick has to land on the other person's phone, not on a refresh.
-- ---------------------------------------------------------------------
alter table public.shopping_items replica identity full;
alter table public.house_tasks replica identity full;
alter table public.meter_readings replica identity full;
alter table public.utility_purchases replica identity full;

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.shopping_items'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.house_tasks'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.meter_readings'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.utility_purchases'; exception when duplicate_object then null; end;
end $$;
