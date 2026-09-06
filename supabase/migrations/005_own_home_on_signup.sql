-- =====================================================================
--  Migration 005 — a new account gets its own home, not somebody else's.
--
--  Until now handle_new_user() put EVERY new account into the one
--  hard-coded household. With sign-ups open on the project and the anon
--  key public in the repo, anyone who created an account landed inside
--  that home with full read/write. This closes that.
--
--  Existing profiles are not touched: whoever is in a household stays in it.
--  Paste into the Supabase SQL Editor and Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. New accounts get a household of their own.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  nm text;
  home uuid;
begin
  nm := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    initcap(replace(replace(split_part(new.email, '@', 1), '.', ' '), '_', ' '))
  );

  -- Somewhere to put them: their own, empty home. Joining an existing one is
  -- what an invite will be for; until that exists there is no way in from outside.
  insert into public.households (name)
  values (coalesce(nullif(nm, ''), 'Our') || '''s Home')
  returning id into home;

  insert into public.profiles (id, household_id, display_name, color)
  values (new.id, home, coalesce(nullif(nm, ''), 'Someone'), '#B84D24')
  on conflict (id) do nothing;

  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. Belt and braces: a profile can never be moved to another household.
--    The update policy already checks this, but it leans on when the
--    policy's own function sees the row. A trigger does not.
-- ---------------------------------------------------------------------
create or replace function public.profiles_lock_household()
returns trigger
language plpgsql
as $$
begin
  if new.household_id is distinct from old.household_id then
    raise exception 'A profile cannot be moved to another household';
  end if;
  return new;
end
$$;

drop trigger if exists profiles_no_household_hop on public.profiles;
create trigger profiles_no_household_hop
  before update on public.profiles
  for each row execute function public.profiles_lock_household();

-- ---------------------------------------------------------------------
-- 3. Nobody may conjure or delete households directly. The signup trigger
--    (security definer) is the only thing that makes one.
-- ---------------------------------------------------------------------
drop policy if exists "household: members insert" on public.households;
drop policy if exists "household: members delete" on public.households;

-- ---------------------------------------------------------------------
-- 4. Show what the change did: every household and who is in it.
--    Expect the Bakers' home with its two people, and nothing else.
-- ---------------------------------------------------------------------
select
  h.id,
  h.name,
  count(p.id) as members,
  coalesce(string_agg(p.display_name, ', ' order by p.created_at), '(empty)') as who
from public.households h
left join public.profiles p on p.household_id = h.id
group by h.id, h.name
order by h.created_at;
