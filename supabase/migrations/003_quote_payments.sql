-- =====================================================================
--  Migration 003 — deposits and part-payments on quotes.
--  A payment toward a quote is an ordinary expense that points at the
--  quote, so it shows up in the expenses list and in cash-out totals
--  without being double-counted against the accepted quote amount.
--  Paste into the Supabase SQL Editor and Run (after 002).
-- =====================================================================

alter table public.expenses
  add column if not exists quote_id uuid references public.quotes (id) on delete set null;

create index if not exists expenses_quote on public.expenses (quote_id);
