-- =====================================================================
--  Migration 013 — Study: questions asked under a letter.
--
--  Each letter can carry a thread of questions and answers — about a
--  verse it quoted, a person it named, a word, a place, anything the
--  letter raised. The answers are written by the edge function `guide`
--  (action "study"), which alone inserts here; a person can read and
--  delete their own. A thread belongs to its letter: when the letter is
--  hidden (012) the thread is unreachable too, except through the PIN
--  functions below, and when the letter is deleted the thread goes with it.
--
--  Paste into the Supabase SQL Editor and Run (after 012).
-- =====================================================================

create table if not exists public.bible_study (
  id uuid primary key default gen_random_uuid(),
  guidance_id uuid not null references public.bible_guidance (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  /** What they asked, exactly. */
  question text not null,
  /** The answer: text, the passages it quotes (with the verse text), readings, the references found in the text, and a few follow-up questions. */
  answer jsonb not null,
  model text not null default ''
);
create index if not exists bible_study_letter on public.bible_study (guidance_id, created_at);
create index if not exists bible_study_user on public.bible_study (user_id, created_at desc);

alter table public.bible_study enable row level security;
-- The function writes (as the service role); people only read and delete. Supabase hands
-- authenticated every privilege on a new public table by default — take the rest back.
revoke all on table public.bible_study from anon, authenticated;
grant select, delete on table public.bible_study to authenticated;

-- A question is visible exactly when its letter is: the policies on bible_guidance
-- (own, and not hidden) apply inside the subquery too.
drop policy if exists "bible_study: own read" on public.bible_study;
create policy "bible_study: own read" on public.bible_study
  for select to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.bible_guidance g where g.id = guidance_id));

drop policy if exists "bible_study: own delete" on public.bible_study;
create policy "bible_study: own delete" on public.bible_study
  for delete to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.bible_guidance g where g.id = guidance_id));

-- ---------------------------------------------------------------------
-- A hidden letter's thread, behind the PIN — the same shape as 012's
-- functions: {ok: true, ...} or {ok: false, error, attempts_left, locked_until}.
-- ---------------------------------------------------------------------

/** The thread under a hidden letter, oldest first — for the right PIN. */
create or replace function public.bible_hidden_study(p_id uuid, p_pin text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare check_result jsonb;
begin
  check_result := public.bible_check_pin(p_pin);
  if not (check_result ->> 'ok')::boolean then return check_result; end if;
  if not exists (select 1 from public.bible_guidance g where g.id = p_id and g.user_id = auth.uid() and g.hidden) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'study', coalesce((
    select jsonb_agg(to_jsonb(s) order by s.created_at)
      from public.bible_study s
     where s.guidance_id = p_id and s.user_id = auth.uid()), '[]'::jsonb));
end $$;

/** Removes one question (and its answer) from a hidden letter's thread. */
create or replace function public.bible_hidden_study_delete(p_id uuid, p_pin text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare check_result jsonb; n integer;
begin
  check_result := public.bible_check_pin(p_pin);
  if not (check_result ->> 'ok')::boolean then return check_result; end if;
  delete from public.bible_study s
   where s.id = p_id and s.user_id = auth.uid()
     and exists (select 1 from public.bible_guidance g where g.id = s.guidance_id and g.hidden);
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.bible_hidden_study(uuid, text) from public, anon;
revoke execute on function public.bible_hidden_study_delete(uuid, text) from public, anon;
grant execute on function public.bible_hidden_study(uuid, text) to authenticated;
grant execute on function public.bible_hidden_study_delete(uuid, text) to authenticated;
