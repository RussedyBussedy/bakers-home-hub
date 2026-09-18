-- The clock, not just the calendar.
--
-- A prepaid meter's arithmetic turns on the order of two events that often
-- happen on the same day: reading the dial, and loading a token. Read first
-- and top up an hour later and the day's date cannot tell the two apart —
-- the units look as though they were already in a reading taken before they
-- existed, and the period comes out negative.
--
-- A wall-clock time settles it. Both columns are nullable, and a record
-- without one keeps the old assumption exactly: a reading is taken as the end
-- of its day, a top-up as the start of its, so a token bought on the day of a
-- reading is treated as already in that reading. Nothing already logged moves.

alter table public.meter_readings    add column if not exists read_time   time;
alter table public.utility_purchases add column if not exists bought_time time;

comment on column public.meter_readings.read_time is
  'Wall-clock time the dial was read. Null on older records, which are taken as end-of-day.';
comment on column public.utility_purchases.bought_time is
  'Wall-clock time the token was bought. Null on older records, which are taken to precede any reading that day.';
