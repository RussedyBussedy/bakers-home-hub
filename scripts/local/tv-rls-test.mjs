/**
 * The TV link (migration 016) against a real Postgres: the row-level policy on tv_devices, the
 * unreadable tv_secrets, and the SECURITY DEFINER functions, run as the `anon` role (the TV) and the
 * `authenticated` role (people in two different homes) the way PostgREST runs them.
 *
 * Runs on a throwaway in-memory Postgres (PGlite) with just enough Supabase around it — roles, auth.uid()
 * reading request.jwt.claim.sub, pgcrypto in `extensions`, households and profiles — so it needs no
 * database of its own:
 *   npm i --no-save @electric-sql/pglite && node scripts/local/tv-rls-test.mjs
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const db = new PGlite({ extensions: { pgcrypto } });
const H1 = 'aaaaaaaa-0000-0000-0000-000000000001', H2 = 'aaaaaaaa-0000-0000-0000-000000000002';
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222';
const S1 = 'tv-secret-one-'.padEnd(48, 'x'), S2 = 'tv-secret-two-'.padEnd(48, 'y'), S3 = 'tv-secret-three-'.padEnd(48, 'z');
let failed = 0;
const eq = (got, want, label) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) failed++; console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`); };
const as = async (role, uid = '') => { await db.exec('reset role'); await db.exec(`set role ${role}`); await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]); };
const rpc = async (fn, args = []) => (await db.query(`select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args)).rows[0].r;
const err = async (sql, args = []) => { try { await db.query(sql, args); return 'no error'; } catch (e) { return e.message; } };
const pick = (r, ...keys) => Object.fromEntries(keys.map((k) => [k, r[k]]));

// ---- just enough of Supabase -------------------------------------------------------------------
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create schema extensions;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, extensions, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  -- what Supabase grants on everything new in public; the migration takes back what it must
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  create publication supabase_realtime;
  create table public.households (id uuid primary key default gen_random_uuid(), name text not null default 'Our Home');
  create table public.profiles (id uuid primary key references auth.users (id), household_id uuid not null references public.households (id));
  create function public.current_household_id() returns uuid language sql stable security definer set search_path = public as $$
    select household_id from public.profiles where id = auth.uid() $$;
  insert into auth.users values ('${U1}'), ('${U2}');
  insert into public.households values ('${H1}', 'The Bakers'), ('${H2}', 'Next Door');
  insert into public.profiles values ('${U1}', '${H1}'), ('${U2}', '${H2}');
`);
await db.exec(readFileSync(new URL('../../supabase/migrations/016_tv.sql', import.meta.url), 'utf8'));

// ---- a TV asks to be linked --------------------------------------------------------------------
await as('anon');
eq(await rpc('tv_register', [S1, 'KQ7MX4', 'Lounge TV']), { ok: true }, 'the TV registers with its code');
eq(await rpc('tv_register', [S2, 'KQ7MX4']), { ok: false, error: 'code_taken' }, 'a code in use is refused, so the TV picks another');
eq(await rpc('tv_register', [S2, 'ab12']), { ok: false, error: 'bad_request' }, 'a malformed code is refused');
eq(await rpc('tv_register', ['short', 'ABCDEF']), { ok: false, error: 'bad_request' }, 'so is a short secret');
eq(await rpc('tv_register', [S1, 'ZZZZZZ']), { ok: false, error: 'bad_request' }, 'and a secret already in use');
eq(await rpc('tv_sync', [S1, { v: 1 }]), { ok: true, code: 'KQ7MX4', linked: false }, 'while it waits, its check-in gives back its code');
eq(await rpc('tv_sync', ['not-the-secret'.padEnd(40, 'q'), { v: 1 }]), { ok: false, error: 'unknown' }, 'a wrong secret gets nowhere');
eq((await db.query('select count(*)::int as n from public.tv_devices')).rows[0].n, 0, 'the TV itself cannot read the table');
eq(await err('select * from public.tv_secrets'), 'permission denied for table tv_secrets', 'nor the secrets');
eq(await err(`select public.tv_claim('KQ7MX4')`), 'permission denied for function tv_claim', 'and it cannot claim itself');

// ---- someone in a home types the code ----------------------------------------------------------
await as('authenticated', U2);
eq(await rpc('tv_claim', ['AAAAAA']), { ok: false, error: 'no_such_code' }, 'a code no TV is showing is refused');
await as('authenticated', U1);
const claim = await rpc('tv_claim', ['kq7-mx4']);
eq(claim.ok, true, 'the right code, typed loosely, links the TV to the home');
const TV = claim.id;
eq((await db.query('select name, report, desired_version from public.tv_devices')).rows, [{ name: 'Lounge TV', report: { v: 1 }, desired_version: 0 }], 'the home sees its TV and what it reported');
eq(await err('select * from public.tv_secrets'), 'permission denied for table tv_secrets', 'but never its secret');
eq(await err(`update public.tv_devices set report = '{"v":99}'`), 'permission denied for table tv_devices', 'and cannot rewrite its report');
eq(await err(`insert into public.tv_devices (name) values ('fake')`), 'permission denied for table tv_devices', 'or make up a TV');
eq(await rpc('tv_claim', ['KQ7MX4']), { ok: false, error: 'no_such_code' }, 'a code works once');

// ---- the other home sees none of it ------------------------------------------------------------
await as('authenticated', U2);
eq((await db.query('select count(*)::int as n from public.tv_devices')).rows[0].n, 0, 'next door does not see the TV');
eq(await rpc('tv_set', [TV, { font: 'inter' }]), { ok: false, error: 'not_found' }, 'cannot change it');
eq(await rpc('tv_unlink', [TV]), { ok: false, error: 'not_found' }, 'or let it go');

// ---- the Hub changes things, the TV picks them up ----------------------------------------------
await as('authenticated', U1);
eq(await rpc('tv_set', [TV, { font: 'inter' }]), { ok: true, version: 1 }, 'a change moves the version on');
eq(await rpc('tv_set', [TV, { style: 'icons' }]), { ok: true, version: 2 }, 'and so does the next');
eq(await rpc('tv_set', [TV, '[1,2]']), { ok: false, error: 'bad_request' }, 'only an object of settings is taken');
await as('anon');
eq(pick(await rpc('tv_sync', [S1, { v: 2 }]), 'linked', 'home', 'name', 'desired', 'version'),
  { linked: true, home: 'The Bakers', name: 'Lounge TV', desired: { font: 'inter', style: 'icons' }, version: 2 }, 'the TV hears both changes, merged, at version 2');
await rpc('tv_sync', [S1, { big: 'x'.repeat(70000) }]);
await as('authenticated', U1);
eq((await db.query('select report from public.tv_devices')).rows[0].report, { v: 2 }, 'an oversized report is ignored');
eq(await err(`select public.tv_set('${TV}', '{"font":"doto"}'::jsonb)`), 'no error', 'someone signed in may call tv_set');
await as('anon');
eq(await err(`select public.tv_set('${TV}', '{"font":"doto"}'::jsonb)`), 'permission denied for function tv_set', 'the TV may not');

// ---- photos for the TV -----------------------------------------------------------------------------
const addPhoto = (home, path, url) => err(`insert into public.tv_photos (household_id, path, url, taken_on, created_by)
  values ($1, $2, $3, '2023-10-31', '${U1}')`, [home, path, url]);
const rls = 'new row violates row-level security policy for table "tv_photos"';
await as('authenticated', U1);
eq(await addPhoto(H1, `${H1}/tv/a.jpg`, 'https://signed/a'), 'no error', 'the home adds a photo for the TV');
eq(await addPhoto(H1, `${H2}/tv/b.jpg`, 'https://signed/b'), rls, 'only from its own folder');
eq(await addPhoto(H2, `${H2}/tv/c.jpg`, 'https://signed/c'), rls, 'and never into another home');
await as('authenticated', U2);
eq((await db.query('select count(*)::int as n from public.tv_photos')).rows[0].n, 0, 'next door does not see it');
await as('anon');
eq((await db.query('select count(*)::int as n from public.tv_photos')).rows[0].n, 0, 'nor does the TV, reading the table');
eq((await rpc('tv_sync', [S1, null])).photos.map((p) => pick(p, 'url', 'taken_on')), [{ url: 'https://signed/a', taken_on: '2023-10-31' }],
  'but its check-in brings the photo, with its link and the day it was taken');
await as('authenticated', U1);
await db.query('delete from public.tv_photos');
await as('anon');
eq((await rpc('tv_sync', [S1, null])).photos, [], 'and a photo taken off is gone from the next check-in');

// ---- a code nobody typed in time ---------------------------------------------------------------
eq(await rpc('tv_register', [S3, 'PQRS23']), { ok: true }, 'another TV registers');
await db.exec('reset role');
await db.exec(`update public.tv_secrets set code_expires = now() - interval '1 minute' where pair_code = 'PQRS23'`);
await as('anon');
eq(await rpc('tv_sync', [S3, null]), { ok: false, error: 'unknown' }, 'once its code has run out it is forgotten');
await db.exec('reset role');
eq((await db.query('select count(*)::int as n from public.tv_devices where household_id is null')).rows[0].n, 0, 'and its half-made row is gone');

// ---- letting go ----------------------------------------------------------------------------------
await as('authenticated', U1);
eq(await rpc('tv_unlink', [TV]), { ok: true }, 'the home lets its TV go');
await as('anon');
eq(await rpc('tv_sync', [S1, { v: 3 }]), { ok: false, error: 'unknown' }, 'and the TV hears it is unknown');

// ---- or the TV lets itself go --------------------------------------------------------------------
const S4 = 'tv-secret-four-'.padEnd(48, 'w');
eq(await rpc('tv_register', [S4, 'WXYZ45']), { ok: true }, 'a TV registers again');
await as('authenticated', U1);
eq((await rpc('tv_claim', ['WXYZ45'])).ok, true, 'and is linked');
await as('anon');
eq(await rpc('tv_leave', ['not-the-secret'.padEnd(40, 'q')]), { ok: false, error: 'unknown' }, 'leaving needs its secret');
eq(await rpc('tv_leave', [S4]), { ok: true }, 'with it, the TV unlinks itself');
await as('authenticated', U1);
eq((await db.query('select count(*)::int as n from public.tv_devices')).rows[0].n, 0, 'and the home no longer sees it');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
