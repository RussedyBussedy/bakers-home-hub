-- =====================================================================
--  Migration 016 — the TV: the home screen on the lounge TV (the "My TV"
--  launcher on the Mi Box), linked to the home and set from the Hub.
--
--  The Hub can't reach the TV directly: it is a secure website and the TV a
--  plain device on the home Wi-Fi, and browsers won't let one talk to the
--  other. So they meet here. The Hub writes what it wants the TV to be
--  (`desired`: its style, font, weather town, favourites, what the remote's
--  buttons open); the TV checks in every minute or so while it is on, takes
--  anything newer than what it last took, and leaves word of how it is
--  (`report`: its settings as they stand, its apps, what is playing, the
--  weather, its Wi-Fi). Photos added in the Hub (`tv_photos`) go to it the
--  same way, for its slideshow and backgrounds.
--
--  The TV has no account. It links with a code it shows on screen (gear >
--  Link to Home Hub) that someone in the home types into the Hub; from then
--  on it carries a long random secret that only the functions below check.
--  The secret's hash lives in a table nobody can read over the API.
--
--  Paste into the Supabase SQL Editor and Run (after 015).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.tv_devices (
  id uuid primary key default gen_random_uuid(),
  /** Null while the TV waits for someone to type its code. */
  household_id uuid references public.households (id) on delete cascade,
  name text not null default 'The TV',
  /** What the Hub wants the TV to be; one version per change, so the TV takes each change once. */
  desired jsonb not null default '{}'::jsonb,
  desired_version integer not null default 0,
  desired_by uuid references auth.users (id) on delete set null,
  /** How the TV says it is, as of its last check-in. */
  report jsonb not null default '{}'::jsonb,
  last_seen timestamptz,
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tv_devices_household on public.tv_devices (household_id);

-- ---------------------------------------------------------------------
-- The TV's half of the link. Never readable over the API: no grants on the
-- table, only the functions below touch it.
-- ---------------------------------------------------------------------
create table if not exists public.tv_secrets (
  device_id uuid primary key references public.tv_devices (id) on delete cascade,
  /** sha256 of the TV's secret, in hex. */
  secret_hash text not null unique,
  /** The code on the TV's screen, until someone in a home types it in. */
  pair_code text,
  code_expires timestamptz
);
create unique index if not exists tv_secrets_pair_code on public.tv_secrets (pair_code) where pair_code is not null;
alter table public.tv_secrets enable row level security;
revoke all on table public.tv_secrets from anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS — the home's TVs, for everyone in the home to read. Every write goes
-- through a function, so nobody can change what a TV reported, or reach
-- into another home's.
-- ---------------------------------------------------------------------
alter table public.tv_devices enable row level security;
revoke insert, update, delete, truncate on table public.tv_devices from anon, authenticated;

drop policy if exists "tv_devices: household read" on public.tv_devices;
create policy "tv_devices: household read" on public.tv_devices
  for select to authenticated
  using (household_id = public.current_household_id());

-- ---------------------------------------------------------------------
-- Photos for the TV, added in the Hub. Each is kept in the home's media
-- folder (<home>/tv/...) and handed to the TV as a long-lived signed link,
-- made by the Hub as it uploads (the TV has no account to sign one with).
-- The TV fetches each once, gives it the TV treatment and keeps it for its
-- slideshow and backgrounds; one removed here goes from the TV too.
-- `taken_on` is the day the picture was taken, read from it, so it comes
-- back on that day in later years.
-- ---------------------------------------------------------------------
create table if not exists public.tv_photos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  path text not null,
  url text not null,
  taken_on date,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists tv_photos_household on public.tv_photos (household_id, created_at);
alter table public.tv_photos enable row level security;

drop policy if exists "tv_photos: household all" on public.tv_photos;
create policy "tv_photos: household all" on public.tv_photos
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id() and split_part(path, '/', 1) = household_id::text);

-- ---------------------------------------------------------------------
-- The TV asks to be linked, with a new secret and the six-letter code it is
-- showing (no I, O, 0 or 1, so it reads off a screen without doubt).
-- Answers {ok} or {ok:false, error: bad_request | code_taken | busy}; on
-- code_taken the TV simply picks another.
-- ---------------------------------------------------------------------
create or replace function public.tv_register(p_secret text, p_code text, p_name text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
  v_id uuid;
begin
  if p_secret is null or length(p_secret) not between 32 and 200 or p_code is null or p_code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;
  v_hash := encode(extensions.digest(p_secret, 'sha256'), 'hex');
  -- Codes nobody typed in time go, with the half-made TVs that showed them.
  delete from public.tv_devices d using public.tv_secrets s
   where s.device_id = d.id and d.household_id is null and s.code_expires < now();
  if (select count(*) from public.tv_secrets where pair_code is not null) >= 100 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  if exists (select 1 from public.tv_secrets where pair_code = p_code) then
    return jsonb_build_object('ok', false, 'error', 'code_taken');
  end if;
  if exists (select 1 from public.tv_secrets where secret_hash = v_hash) then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;
  insert into public.tv_devices (name) values (coalesce(nullif(left(trim(p_name), 40), ''), 'The TV')) returning id into v_id;
  insert into public.tv_secrets (device_id, secret_hash, pair_code, code_expires)
  values (v_id, v_hash, p_code, now() + interval '30 minutes');
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- Someone in a home types the code their TV is showing, and it is theirs.
-- Dashes, spaces and lower case are forgiven.
-- ---------------------------------------------------------------------
create or replace function public.tv_claim(p_code text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_home uuid := public.current_household_id();
  v_id uuid;
begin
  if auth.uid() is null or v_home is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  select s.device_id into v_id
    from public.tv_secrets s join public.tv_devices d on d.id = s.device_id
   where s.pair_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
     and s.code_expires > now() and d.household_id is null;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_such_code');
  end if;
  update public.tv_secrets set pair_code = null, code_expires = null where device_id = v_id;
  update public.tv_devices set household_id = v_home, claimed_by = auth.uid(), claimed_at = now() where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ---------------------------------------------------------------------
-- The TV checks in: here is how I am; is there anything new for me?
--   {ok, linked:false, code}                                 while it waits
--   {ok, linked:true, home, name, desired, version, photos}  once it is linked
--   {ok:false, error:'unknown'}                              unlinked, or its code ran out
-- `photos` is the home's TV photos, oldest first: [{id, url, taken_on}] (the
-- newest 300). A report over 64 KB is ignored (the check-in still counts).
-- ---------------------------------------------------------------------
create or replace function public.tv_sync(p_secret text, p_report jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.tv_secrets;
  d public.tv_devices;
begin
  select * into s from public.tv_secrets
   where secret_hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex');
  if s.device_id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown');
  end if;
  if s.pair_code is not null and s.code_expires < now() then
    delete from public.tv_devices where id = s.device_id and household_id is null;
    return jsonb_build_object('ok', false, 'error', 'unknown');
  end if;
  update public.tv_devices
     set last_seen = now(),
         report = case when p_report is not null and jsonb_typeof(p_report) = 'object'
                        and octet_length(p_report::text) <= 65536 then p_report else report end
   where id = s.device_id
  returning * into d;
  if d.household_id is null then
    return jsonb_build_object('ok', true, 'linked', false, 'code', s.pair_code);
  end if;
  return jsonb_build_object('ok', true, 'linked', true, 'name', d.name,
    'home', (select h.name from public.households h where h.id = d.household_id),
    'desired', d.desired, 'version', d.desired_version,
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'url', p.url, 'taken_on', p.taken_on) order by p.created_at)
        from (select * from public.tv_photos where household_id = d.household_id order by created_at desc limit 300) p
    ), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- The Hub changes something about a TV in its own home: merged into what the
-- TV should be, one version on. Only the keys sent change.
-- ---------------------------------------------------------------------
create or replace function public.tv_set(p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d public.tv_devices;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or octet_length(p_patch::text) > 16384 then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;
  update public.tv_devices
     set desired = desired || p_patch, desired_version = desired_version + 1, desired_by = auth.uid()
   where id = p_id and household_id = public.current_household_id()
  returning * into d;
  if d.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'version', d.desired_version);
end $$;

-- ---------------------------------------------------------------------
-- Let a TV go. On its next check-in it hears 'unknown' and forgets the link.
-- ---------------------------------------------------------------------
create or replace function public.tv_unlink(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.tv_devices where id = p_id and household_id = public.current_household_id();
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- Or the TV lets itself go (Unlink in its own gear menu): it holds the
-- secret, so it may.
-- ---------------------------------------------------------------------
create or replace function public.tv_leave(p_secret text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select device_id into v_id from public.tv_secrets
   where secret_hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex');
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown');
  end if;
  delete from public.tv_devices where id = v_id;
  return jsonb_build_object('ok', true);
end $$;

-- Who may call what: the TV (anonymous) registers, checks in and may leave;
-- only someone signed in claims, changes or lets go of a TV.
revoke all on function public.tv_register(text, text, text) from public, anon, authenticated;
revoke all on function public.tv_sync(text, jsonb) from public, anon, authenticated;
revoke all on function public.tv_leave(text) from public, anon, authenticated;
revoke all on function public.tv_claim(text) from public, anon, authenticated;
revoke all on function public.tv_set(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.tv_unlink(uuid) from public, anon, authenticated;
grant execute on function public.tv_register(text, text, text) to anon, authenticated;
grant execute on function public.tv_sync(text, jsonb) to anon, authenticated;
grant execute on function public.tv_leave(text) to anon, authenticated;
grant execute on function public.tv_claim(text) to authenticated;
grant execute on function public.tv_set(uuid, jsonb) to authenticated;
grant execute on function public.tv_unlink(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Realtime — what's playing should change on the phone as it changes on the TV.
-- ---------------------------------------------------------------------
alter table public.tv_devices replica identity full;
alter table public.tv_photos replica identity full;

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.tv_devices'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.tv_photos'; exception when duplicate_object then null; end;
end $$;
