-- =====================================================================
--  Migration 008 — every home keeps its own currency.
--
--  The app was rand-only. Now the browser guesses a currency from where
--  the device is (time zone first, then language) and sends it with the
--  signup; the home stores it, so everyone in a home reads the same
--  figures whichever country they happen to be sitting in.
--
--  Existing homes keep rand — the column backfills to ZAR, and only then
--  does the default change for the homes made from here on.
--
--  Nothing converts. The column decides which symbol is drawn, never
--  what a number means.
--  Paste into the Supabase SQL Editor and Run.
-- =====================================================================

-- 1. The column. Every row that exists today is South African.
alter table public.households
  add column if not exists currency text not null default 'ZAR';

-- New homes fall back to the dollar when the browser sends nothing usable.
alter table public.households alter column currency set default 'USD';

alter table public.households drop constraint if exists households_currency_iso;
alter table public.households
  add constraint households_currency_iso check (currency ~ '^[A-Z]{3}$');

-- 2. The signup trigger reads the guess. Same shape as 007; the only new
--    lines are the currency ones. An invite still wins: joining a home
--    means joining its currency too.
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
  cur text;
  inv public.invites%rowtype;
begin
  nm := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    initcap(replace(replace(split_part(new.email, '@', 1), '.', ' '), '_', ' '))
  );
  supplied_code := nullif(new.raw_user_meta_data ->> 'invite_code', '');
  home_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'household_name', '')), '');

  -- Anything that isn't a plain three-letter code is ignored rather than trusted.
  cur := upper(btrim(coalesce(new.raw_user_meta_data ->> 'currency', '')));
  if cur !~ '^[A-Z]{3}$' then
    cur := null;
  end if;

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
    insert into public.households (name, currency)
    values (
      coalesce(left(home_name, 60), coalesce(nullif(nm, ''), 'Our') || '''s Home'),
      coalesce(cur, 'USD')
    )
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

-- 3. Show what it did. Expect The Bakers on ZAR, and nothing else.
select h.name, h.currency, count(p.id) as members
from public.households h
left join public.profiles p on p.household_id = h.id
group by h.id, h.name, h.currency
order by h.created_at;
