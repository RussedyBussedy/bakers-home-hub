-- =====================================================================
--  Migration 010 — read the dial the way it is written.
--
--  A domestic water meter shows black wheels for whole kilolitres and red
--  wheels for the fraction. Reading straight across gives one long number
--  (1046 | 6205), which the app was taking at face value — so a reading of
--  1 046.6205 kl arrived as ten million. The home now records how many of
--  the trailing wheels are red, and the reading column keeps the fraction
--  the wheels can actually show.
--  Paste into the Supabase SQL Editor and Run (after 009).
-- =====================================================================

-- Four red wheels resolve to a tenth of a litre; numeric(14, 3) was rounding
-- that away and quietly changing what the photograph says.
alter table public.meter_readings
  alter column reading type numeric(14, 4);

-- How many of the wheels on each meter are the red, fractional ones.
-- Three is the common domestic water meter; a prepaid electricity meter
-- normally shows whole units, hence zero.
alter table public.households
  add column if not exists water_meter_decimals int not null default 3
    check (water_meter_decimals between 0 and 6),
  add column if not exists electricity_meter_decimals int not null default 0
    check (electricity_meter_decimals between 0 and 6);

-- ---------------------------------------------------------------------
-- The Bakers' meter (24046929) is a four-and-four, and two readings were
-- already typed straight across before the app understood that. Named
-- exactly, so nothing else can be caught by it.
-- ---------------------------------------------------------------------
update public.households
   set water_meter_decimals = 4
 where water_meter_no = '24046929';

update public.meter_readings
   set reading = reading / 10000
 where utility = 'water'
   and reading in (10454334, 10466205);
