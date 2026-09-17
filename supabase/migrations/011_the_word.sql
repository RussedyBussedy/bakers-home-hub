-- =====================================================================
--  Migration 011 — The Word: a pastor's letter from the Scriptures.
--
--  Write down what is going on in your life and the Hub answers the way a
--  seasoned pastor would — with the passages that speak to it, a plain
--  explanation, a few things to do this week, a prayer, and a short
--  reading plan to walk through. The Bible itself (both translations, the
--  Nave's topical index, the cross-references and their embeddings) lives
--  in the `bible` schema, loaded by the BibleBot repo. This migration only
--  adds what the Hub needs on top:
--
--    1. public.bible_guidance — each person's letters, private to them.
--    2. A few SECURITY DEFINER doors into the `bible` schema so the edge
--       function can search it over the API without the schema itself ever
--       being exposed. Only the service role may open them.
--
--  Paste into the Supabase SQL Editor and Run (after 010, and after the
--  BibleBot "Load and embed" workflow has filled the bible schema).
-- =====================================================================

-- ---------------------------------------------------------------------
-- The letters. Nothing here is shared with the rest of the home: what
-- someone brings to a pastor is theirs.
-- ---------------------------------------------------------------------
create table if not exists public.bible_guidance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  /** What they wrote, exactly. */
  context text not null,
  translation text not null default 'BSB' check (translation in ('BSB', 'KJV')),
  /** A few words naming the matter — "Anxiety about money" — for the history list. */
  theme text not null default '',
  /** The letter itself: greeting, passages (with the verse text), understanding, response, prayer, closing, plan. */
  response jsonb not null,
  /** Which readings in the plan have been ticked: {"0": "2026-09-17", "2": "2026-09-19"}. */
  plan_done jsonb not null default '{}'::jsonb,
  model text not null default ''
);
create index if not exists bible_guidance_user on public.bible_guidance (user_id, created_at desc);

alter table public.bible_guidance enable row level security;

drop policy if exists "bible_guidance: own read" on public.bible_guidance;
create policy "bible_guidance: own read" on public.bible_guidance
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "bible_guidance: own insert" on public.bible_guidance;
create policy "bible_guidance: own insert" on public.bible_guidance
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "bible_guidance: own update" on public.bible_guidance;
create policy "bible_guidance: own update" on public.bible_guidance
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "bible_guidance: own delete" on public.bible_guidance;
create policy "bible_guidance: own delete" on public.bible_guidance
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Doors into the bible schema. Each runs as its owner (postgres) with an
-- empty search_path, so everything inside is spelled out in full. They are
-- revoked from everyone but the service role, which only the edge function
-- holds — the browser never sees them.
-- ---------------------------------------------------------------------

-- The shape of the canon: every book with the number of verses in each of its
-- chapters. Fetched once per function instance and cached, so a reference like
-- "Philippians 4:4-9" can be checked without another trip to the database.
create or replace function public.bible_canon()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'name', b.name, 'usx', b.usx, 'osis', b.osis, 'testament', b.testament,
           'chapters', (select jsonb_agg(c.n order by c.chapter)
                        from (select v.chapter, count(*) as n from bible.verses v where v.book_id = b.id group by v.chapter) c)
         ) order by b.id), '[]'::jsonb)
  from bible.books b;
$$;

-- Everything the letter can draw on, in one round trip: the verses nearest to
-- what was written, the Nave's topic entries nearest to it (with their verses),
-- and the strongest cross-references of the top few verses.
create or replace function public.bible_retrieve(
  query_embedding text,
  k_verses integer default 24,
  k_topics integer default 6,
  p_translation text default 'BSB'
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  q extensions.halfvec(768);
  verses jsonb;
  topics jsonb;
  xrefs jsonb;
begin
  q := query_embedding::extensions.halfvec(768);

  select coalesce(jsonb_agg(jsonb_build_object(
           'verse_id', v.verse_id, 'book_id', v.book_id, 'chapter', v.chapter, 'verse', v.verse,
           'reference', v.reference, 'text', v.text, 'similarity', round(v.similarity::numeric, 4)
         ) order by v.similarity desc), '[]'::jsonb)
    into verses
    from bible.match_verses(q, greatest(1, least(k_verses, 60)), p_translation) v;

  select coalesce(jsonb_agg(jsonb_build_object(
           'entry_id', t.entry_id, 'subject', t.subject, 'path', t.path, 'heading', t.heading,
           'similarity', round(t.similarity::numeric, 4),
           'verses', (select coalesce(jsonb_agg(jsonb_build_object(
                        'verse_id', e.verse_id, 'reference', e.reference, 'text', e.text,
                        'range_start', e.range_start, 'range_end', e.range_end
                      ) order by e.verse_id), '[]'::jsonb)
                      from (select * from bible.entry_verses(t.entry_id, p_translation) limit 16) e)
         ) order by t.similarity desc), '[]'::jsonb)
    into topics
    from bible.match_topic_entries(q, greatest(1, least(k_topics, 12))) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'from_verse_id', s.verse_id, 'to_start', x.to_start, 'to_end', x.to_end, 'votes', x.votes,
           'verses', (select coalesce(jsonb_agg(jsonb_build_object('verse_id', p.verse_id, 'reference', p.reference, 'text', p.text) order by p.verse_id), '[]'::jsonb)
                      from bible.passage_text(x.to_start, least(x.to_end, x.to_start + 3), p_translation) p)
         )), '[]'::jsonb)
    into xrefs
    from (select (e ->> 'verse_id')::integer as verse_id
            from jsonb_array_elements(verses) with ordinality as a(e, n)
           where n <= 3) s
    cross join lateral bible.cross_refs_for(s.verse_id, 4, p_translation) x;

  return jsonb_build_object('verses', verses, 'topics', topics, 'cross_refs', xrefs);
end $$;

-- A passage to read: a whole chapter, or verses p_start to p_end of it.
-- Null when the book or chapter does not exist, so a made-up reference is caught.
create or replace function public.bible_passage(
  p_book integer,
  p_chapter integer,
  p_start integer default null,
  p_end integer default null,
  p_translation text default 'BSB'
)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with b as (select id, name from bible.books where id = p_book),
       vs as (
         select v.verse, t.text
           from bible.verses v
           join bible.verse_text t on t.verse_id = v.id and t.translation = p_translation
          where v.book_id = p_book and v.chapter = p_chapter
            and (p_start is null or v.verse >= p_start)
            and (p_end is null or v.verse <= p_end)
          order by v.verse)
  select case when not exists (select 1 from vs) then null
         else jsonb_build_object(
           'book_id', p_book, 'book', (select name from b), 'chapter', p_chapter,
           'start', (select min(verse) from vs), 'end', (select max(verse) from vs),
           'verses', (select jsonb_agg(jsonb_build_object('verse', verse, 'text', text) order by verse) from vs))
         end;
$$;

revoke execute on function public.bible_canon() from public, anon, authenticated;
revoke execute on function public.bible_retrieve(text, integer, integer, text) from public, anon, authenticated;
revoke execute on function public.bible_passage(integer, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.bible_canon() to service_role;
grant execute on function public.bible_retrieve(text, integer, integer, text) to service_role;
grant execute on function public.bible_passage(integer, integer, integer, integer, text) to service_role;
