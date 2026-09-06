-- =====================================================================
--  Migration 007 — people name their own home when they register.
--
--  006 named a new household after the person ("Gran's Home"). Now the
--  registration form asks, and whatever they type is used; the app shows
--  it as "<name> Hub". Falls back to the old behaviour if they skip it.
--
--  Someone arriving on an invite doesn't name anything — they are joining
--  a home that already has a name.
--  Paste into the Supabase SQL Editor and Run.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  nm text;
  home uuid;
  home_name text;
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
  home_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'household_name', '')), '');

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
    values (coalesce(left(home_name, 60), coalesce(nullif(nm, ''), 'Our') || '''s Home'))
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
