-- =====================================================================
--  Migration 006 — invite someone into your home.
--
--  A member creates an invite; the link carries a code. Whoever opens it
--  can see which home they were invited to (name only) before they
--  register, and when they do, the signup trigger puts them in that
--  household instead of making them a new one.
--
--  One home per person: an invite is only ever redeemed at signup, so
--  somebody who already has a home cannot be pulled into another.
--  Paste into the Supabase SQL Editor and Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The invites themselves.
-- ---------------------------------------------------------------------
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  -- Who it was meant for, so a list of pending invites is readable at a glance.
  invited_name text not null default '',
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invites_household on public.invites (household_id, created_at desc);

alter table public.invites enable row level security;

-- Members see and manage their own home's invites. Nobody else sees them at all:
-- the person holding the link reads what they need through invite_preview() below.
drop policy if exists "invites: household read" on public.invites;
create policy "invites: household read" on public.invites
  for select to authenticated using (household_id = public.current_household_id());

drop policy if exists "invites: household create" on public.invites;
create policy "invites: household create" on public.invites
  for insert to authenticated
  with check (household_id = public.current_household_id() and created_by = auth.uid());

-- Cancelling is the only edit; an invite is never re-pointed at another home.
drop policy if exists "invites: household revoke" on public.invites;
create policy "invites: household revoke" on public.invites
  for update to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

drop policy if exists "invites: household delete" on public.invites;
create policy "invites: household delete" on public.invites
  for delete to authenticated using (household_id = public.current_household_id());

-- ---------------------------------------------------------------------
-- 2. An invite is live until it is used, cancelled, or runs out.
-- ---------------------------------------------------------------------
create or replace function public.invite_is_live(inv public.invites)
returns boolean
language sql immutable
as $$
  select inv.accepted_at is null and inv.revoked_at is null and inv.expires_at > now()
$$;

-- ---------------------------------------------------------------------
-- 3. What the invited person may see before they have an account:
--    the home's name and who asked them. Nothing else, and only with the code.
-- ---------------------------------------------------------------------
create or replace function public.invite_preview(invite_code text)
returns table (household_name text, invited_by text, invited_name text, state text)
language sql stable security definer
set search_path = public
as $$
  select
    h.name,
    split_part(p.display_name, ' ', 1),
    i.invited_name,
    case
      when i.accepted_at is not null then 'used'
      when i.revoked_at is not null then 'cancelled'
      when i.expires_at <= now() then 'expired'
      else 'live'
    end
  from public.invites i
  join public.households h on h.id = i.household_id
  left join public.profiles p on p.id = i.created_by
  where i.code = invite_code
$$;

grant execute on function public.invite_preview(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Signing up: redeem a live invite, or get a home of your own.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  nm text;
  home uuid;
  -- Deliberately not called "code": a local variable of the same name as the column
  -- can't be told apart from it inside the query below.
  supplied_code text;
  inv public.invites%rowtype;
begin
  nm := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    initcap(replace(replace(split_part(new.email, '@', 1), '.', ' '), '_', ' '))
  );
  supplied_code := nullif(new.raw_user_meta_data ->> 'invite_code', '');

  if supplied_code is not null then
    select * into inv from public.invites where invites.code = supplied_code for update;
    if found and public.invite_is_live(inv) then
      home := inv.household_id;
      update public.invites
         set accepted_by = new.id, accepted_at = now()
       where id = inv.id;
    end if;
  end if;

  -- No code, or the invite died between opening the link and registering:
  -- they still get an account, in a home of their own. The app says so.
  if home is null then
    insert into public.households (name)
    values (coalesce(nullif(nm, ''), 'Our') || '''s Home')
    returning id into home;
  end if;

  insert into public.profiles (id, household_id, display_name, color)
  values (
    new.id,
    home,
    coalesce(nullif(nm, ''), 'Someone'),
    case (select count(*) from public.profiles where household_id = home)
      when 0 then '#B84D24' when 1 then '#7F5A9E' else '#4F7291' end
  )
  on conflict (id) do nothing;

  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 5. Getting someone out again. Migration 005 locked household_id so a
--    profile can't hop homes; these two functions are the only sanctioned
--    way past it, and they only ever move somebody to a fresh empty home
--    of their own — the household keeps everything that was made in it.
-- ---------------------------------------------------------------------
create or replace function public.profiles_lock_household()
returns trigger
language plpgsql
as $$
begin
  if new.household_id is distinct from old.household_id
     and coalesce(current_setting('app.moving_home', true), '') <> 'yes' then
    raise exception 'A profile cannot be moved to another household';
  end if;
  return new;
end
$$;

create or replace function public.eject_to_own_home(who uuid)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  nm text;
  home uuid;
begin
  select display_name into nm from public.profiles where id = who;
  insert into public.households (name)
  values (coalesce(nullif(nm, ''), 'Our') || '''s Home')
  returning id into home;

  perform set_config('app.moving_home', 'yes', true);  -- this transaction only
  update public.profiles set household_id = home where id = who;
  perform set_config('app.moving_home', '', true);
  return home;
end
$$;

-- Remove somebody else from the home you are both in.
create or replace function public.remove_member(who uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  mine uuid;
begin
  mine := public.current_household_id();
  if mine is null then raise exception 'Not signed in'; end if;
  if who = auth.uid() then raise exception 'Use leave_household to remove yourself'; end if;
  if not exists (select 1 from public.profiles where id = who and household_id = mine) then
    raise exception 'That person is not in your home';
  end if;
  perform public.eject_to_own_home(who);
end
$$;

-- Leave the home you are in; you land in an empty one of your own.
create or replace function public.leave_household()
returns uuid
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  return public.eject_to_own_home(auth.uid());
end
$$;

grant execute on function public.remove_member(uuid) to authenticated;
grant execute on function public.leave_household() to authenticated;
revoke execute on function public.eject_to_own_home(uuid) from anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Live sync, so an invite appearing or a member leaving lands on the
--    other phone without a refresh.
-- ---------------------------------------------------------------------
alter table public.invites replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.invites;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 7. Where things stand.
-- ---------------------------------------------------------------------
select h.name as home, count(p.id) as members,
       coalesce(string_agg(p.display_name, ', '), '(empty)') as who,
       (select count(*) from public.invites i where i.household_id = h.id and public.invite_is_live(i)) as live_invites
from public.households h
left join public.profiles p on p.household_id = h.id
group by h.id, h.name order by h.created_at;
