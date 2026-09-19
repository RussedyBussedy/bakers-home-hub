-- =====================================================================
--  Migration 014 — Study, per reading.
--
--  A question can sit under one reading of the letter's plan ("Walk
--  with this") instead of under the letter as a whole: reading_index is
--  the reading's position in the plan (0 = Day 1), or null for the
--  letter itself. The only thing a person may ever change on a study row
--  is that column — so a question asked in the wrong place can be moved
--  to where it belongs — hence a column-level UPDATE grant and its
--  policy. Hidden letters get a PIN-checked function for the same move.
--
--  Paste into the Supabase SQL Editor and Run (after 013).
-- =====================================================================

alter table public.bible_study add column if not exists reading_index integer
  check (reading_index is null or reading_index >= 0);
create index if not exists bible_study_letter_reading on public.bible_study (guidance_id, reading_index, created_at);

grant update (reading_index) on table public.bible_study to authenticated;

drop policy if exists "bible_study: own move" on public.bible_study;
create policy "bible_study: own move" on public.bible_study
  for update to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.bible_guidance g where g.id = guidance_id))
  with check (user_id = auth.uid() and exists (select 1 from public.bible_guidance g where g.id = guidance_id));

/** Moves a question under a hidden letter to another reading (or back to the letter with null) — for the right PIN. */
create or replace function public.bible_hidden_study_move(p_id uuid, p_index integer, p_pin text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare check_result jsonb; row_out public.bible_study%rowtype;
begin
  check_result := public.bible_check_pin(p_pin);
  if not (check_result ->> 'ok')::boolean then return check_result; end if;
  if p_index is not null and p_index < 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  update public.bible_study s
     set reading_index = p_index
   where s.id = p_id and s.user_id = auth.uid()
     and exists (select 1 from public.bible_guidance g where g.id = s.guidance_id and g.hidden)
   returning * into row_out;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'study', to_jsonb(row_out));
end $$;

revoke execute on function public.bible_hidden_study_move(uuid, integer, text) from public, anon;
grant execute on function public.bible_hidden_study_move(uuid, integer, text) to authenticated;
