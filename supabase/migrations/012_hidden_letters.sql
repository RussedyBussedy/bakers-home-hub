-- =====================================================================
--  Migration 012 — hidden letters, behind a PIN.
--
--  Nobody else's account can read a letter (011). This is for the other
--  case: someone looking over your shoulder, or holding your phone while
--  it is signed in. A letter can be hidden, and hidden letters are not
--  merely filtered out on the screen — the row-level policies stop
--  returning them at all, and the only way back to them is a function
--  that checks a PIN the person set. Five wrong guesses lock the PIN for
--  fifteen minutes. Face ID / fingerprint on a phone is a convenience the
--  app adds on top (it keeps the PIN on that device); the database only
--  ever sees the PIN.
--
--  Paste into the Supabase SQL Editor and Run (after 011).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

alter table public.bible_guidance add column if not exists hidden boolean not null default false;
create index if not exists bible_guidance_user_hidden on public.bible_guidance (user_id, hidden, created_at desc);

-- ---------------------------------------------------------------------
-- The PIN. Never readable over the API: no grants on the table, only the
-- functions below touch it.
-- ---------------------------------------------------------------------
create table if not exists public.bible_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  /** bcrypt, via pgcrypto's crypt(). Null until a PIN is set. */
  pin_hash text,
  pin_failed integer not null default 0,
  pin_locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.bible_prefs enable row level security;
revoke all on table public.bible_prefs from anon, authenticated;

-- ---------------------------------------------------------------------
-- Visible letters only, for the ordinary policies. Postgres also holds an
-- UPDATE's new row to the SELECT policy, so even hiding a letter (which
-- makes it invisible) has to go through a function; everything after that
-- goes through the PIN functions.
-- ---------------------------------------------------------------------
drop policy if exists "bible_guidance: own read" on public.bible_guidance;
create policy "bible_guidance: own read" on public.bible_guidance
  for select to authenticated using (user_id = auth.uid() and not hidden);

drop policy if exists "bible_guidance: own update" on public.bible_guidance;
create policy "bible_guidance: own update" on public.bible_guidance
  for update to authenticated using (user_id = auth.uid() and not hidden) with check (user_id = auth.uid());

drop policy if exists "bible_guidance: own delete" on public.bible_guidance;
create policy "bible_guidance: own delete" on public.bible_guidance
  for delete to authenticated using (user_id = auth.uid() and not hidden);

-- ---------------------------------------------------------------------
-- The PIN functions. Each answers with a small JSON object rather than
-- raising, because a raised error would roll back the failed-attempt
-- count along with everything else. {ok: true, ...} or
-- {ok: false, error: 'wrong_pin' | 'pin_locked' | 'pin_not_set' | 'bad_pin' | 'not_found', attempts_left, locked_until}.
-- ---------------------------------------------------------------------
create or replace function public.bible_pin_status()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'has_pin', coalesce((select p.pin_hash is not null from public.bible_prefs p where p.user_id = auth.uid()), false),
    'locked_until', (select p.pin_locked_until from public.bible_prefs p where p.user_id = auth.uid() and p.pin_locked_until > now()),
    'hidden_count', (select count(*) from public.bible_guidance g where g.user_id = auth.uid() and g.hidden)
  );
$$;

/** Checks a PIN for the signed-in person and keeps the score. Not exposed: the functions below call it. */
create or replace function public.bible_check_pin(p_pin text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.bible_prefs%rowtype;
  tries constant integer := 5;
begin
  select * into r from public.bible_prefs where user_id = auth.uid();
  if not found or r.pin_hash is null then return jsonb_build_object('ok', false, 'error', 'pin_not_set'); end if;
  if r.pin_locked_until is not null and r.pin_locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'pin_locked', 'locked_until', r.pin_locked_until);
  end if;
  if p_pin is not null and r.pin_hash = extensions.crypt(p_pin, r.pin_hash) then
    update public.bible_prefs set pin_failed = 0, pin_locked_until = null where user_id = auth.uid();
    return jsonb_build_object('ok', true);
  end if;
  update public.bible_prefs
     set pin_failed = pin_failed + 1,
         pin_locked_until = case when pin_failed + 1 >= tries then now() + interval '15 minutes' else null end
   where user_id = auth.uid()
   returning * into r;
  if r.pin_locked_until is not null then
    return jsonb_build_object('ok', false, 'error', 'pin_locked', 'locked_until', r.pin_locked_until);
  end if;
  return jsonb_build_object('ok', false, 'error', 'wrong_pin', 'attempts_left', tries - r.pin_failed);
end $$;

/** Sets a PIN (4–8 digits). Changing one needs the old one. */
create or replace function public.bible_set_pin(p_pin text, p_old text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  existing text;
  check_result jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then return jsonb_build_object('ok', false, 'error', 'bad_pin'); end if;
  select pin_hash into existing from public.bible_prefs where user_id = auth.uid();
  if existing is not null then
    check_result := public.bible_check_pin(p_old);
    if not (check_result ->> 'ok')::boolean then return check_result; end if;
  end if;
  insert into public.bible_prefs (user_id, pin_hash, pin_failed, pin_locked_until, updated_at)
  values (auth.uid(), extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), 0, null, now())
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash, pin_failed = 0, pin_locked_until = null, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

/** Forgets the PIN — and, because they cannot be reached any other way, deletes every hidden letter. */
create or replace function public.bible_forget_pin()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  delete from public.bible_guidance where user_id = auth.uid() and hidden;
  get diagnostics n = row_count;
  delete from public.bible_prefs where user_id = auth.uid();
  return jsonb_build_object('ok', true, 'deleted', n);
end $$;

/** Hides a visible letter. Needs no PIN, but there must be one, or the letter could never be reached again. */
create or replace function public.bible_hide(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare has_pin boolean; n integer;
begin
  select p.pin_hash is not null into has_pin from public.bible_prefs p where p.user_id = auth.uid();
  if not coalesce(has_pin, false) then return jsonb_build_object('ok', false, 'error', 'pin_not_set'); end if;
  update public.bible_guidance set hidden = true where id = p_id and user_id = auth.uid() and not hidden;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

/** The hidden letters, newest first — for the right PIN. */
create or replace function public.bible_hidden_letters(p_pin text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare check_result jsonb;
begin
  check_result := public.bible_check_pin(p_pin);
  if not (check_result ->> 'ok')::boolean then return check_result; end if;
  return jsonb_build_object('ok', true, 'letters', coalesce((
    select jsonb_agg(to_jsonb(g) order by g.created_at desc)
      from public.bible_guidance g
     where g.user_id = auth.uid() and g.hidden), '[]'::jsonb));
end $$;

/** Brings a hidden letter back into the open list. */
create or replace function public.bible_unhide(p_id uuid, p_pin text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare check_result jsonb; row_out public.bible_guidance%rowtype;
begin
  check_result := public.bible_check_pin(p_pin);
  if not (check_result ->> 'ok')::boolean then return check_result; end if;
  update public.bible_guidance set hidden = false
   where id = p_id and user_id = auth.uid() and hidden
   returning * into row_out;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'letter', to_jsonb(row_out));
end $$;

/** Ticks (or unticks) a reading on a hidden letter. */
create or replace function public.bible_hidden_tick(p_id uuid, p_index integer, p_done boolean, p_pin text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare check_result jsonb; row_out public.bible_guidance%rowtype;
begin
  check_result := public.bible_check_pin(p_pin);
  if not (check_result ->> 'ok')::boolean then return check_result; end if;
  update public.bible_guidance
     set plan_done = case when p_done then plan_done || jsonb_build_object(p_index::text, to_char(now(), 'YYYY-MM-DD'))
                          else plan_done - p_index::text end
   where id = p_id and user_id = auth.uid() and hidden
   returning * into row_out;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'letter', to_jsonb(row_out));
end $$;

/** Deletes a hidden letter. */
create or replace function public.bible_hidden_delete(p_id uuid, p_pin text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare check_result jsonb; n integer;
begin
  check_result := public.bible_check_pin(p_pin);
  if not (check_result ->> 'ok')::boolean then return check_result; end if;
  delete from public.bible_guidance where id = p_id and user_id = auth.uid() and hidden;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Only signed-in people may call the doors; the scorekeeper is internal.
revoke execute on function public.bible_check_pin(text) from public, anon, authenticated;
revoke execute on function public.bible_pin_status() from public, anon;
revoke execute on function public.bible_set_pin(text, text) from public, anon;
revoke execute on function public.bible_forget_pin() from public, anon;
revoke execute on function public.bible_hide(uuid) from public, anon;
revoke execute on function public.bible_hidden_letters(text) from public, anon;
revoke execute on function public.bible_unhide(uuid, text) from public, anon;
revoke execute on function public.bible_hidden_tick(uuid, integer, boolean, text) from public, anon;
revoke execute on function public.bible_hidden_delete(uuid, text) from public, anon;
grant execute on function public.bible_pin_status() to authenticated;
grant execute on function public.bible_set_pin(text, text) to authenticated;
grant execute on function public.bible_forget_pin() to authenticated;
grant execute on function public.bible_hide(uuid) to authenticated;
grant execute on function public.bible_hidden_letters(text) to authenticated;
grant execute on function public.bible_unhide(uuid, text) to authenticated;
grant execute on function public.bible_hidden_tick(uuid, integer, boolean, text) to authenticated;
grant execute on function public.bible_hidden_delete(uuid, text) to authenticated;
