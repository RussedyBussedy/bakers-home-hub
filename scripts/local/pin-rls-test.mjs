/**
 * Hidden letters, the PIN and the study threads, against a real Postgres — the row-level policies
 * and the SECURITY DEFINER functions of migrations 012 and 013, run as the `authenticated` role the
 * way PostgREST does.
 *
 * Needs a local Postgres that looks enough like Supabase: schemas `auth` (users table + auth.uid()
 * reading request.jwt.claim.sub) and `extensions` (pgcrypto), roles anon / authenticated /
 * service_role, and migrations 011 + 012 + 013 applied. Not part of `npm run units` for that reason.
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres node scripts/local/pin-rls-test.mjs
 */
import pg from 'pg';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres' });
await db.connect();
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222';
const L1 = 'aaaaaaaa-0000-0000-0000-000000000001', L2 = 'aaaaaaaa-0000-0000-0000-000000000002', L3 = 'aaaaaaaa-0000-0000-0000-000000000003';
const Q1 = 'bbbbbbbb-0000-0000-0000-000000000001', Q2 = 'bbbbbbbb-0000-0000-0000-000000000002', Q3 = 'bbbbbbbb-0000-0000-0000-000000000003';
let failed = 0;
const eq = (got, want, label) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) failed++; console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`); };
const as = async (uid) => { await db.query('reset role'); await db.query('set role authenticated'); await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]); };
const rpc = async (fn, args = []) => (await db.query(`select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args)).rows[0].r;
const questions = async () => (await db.query('select question from public.bible_study order by question')).rows.map(r => r.question);

await db.query('reset role');
await db.query(`delete from public.bible_guidance; delete from public.bible_prefs;`);
await db.query(`insert into public.bible_guidance (id, user_id, context, response, theme) values
  ($3, $1, 'one', '{"plan":[{"reference":"Psalm 23"}]}', 'A'),
  ($4, $1, 'two', '{}', 'B'),
  ($5, $2, 'hers', '{}', 'C')`, [U1, U2, L1, L2, L3]);
// the function (service role) writes the study rows; here the owner stands in for it
await db.query(`insert into public.bible_study (id, guidance_id, user_id, question, answer) values
  ($1, $4, $7, 'who was david', '{"text":"a shepherd"}'),
  ($2, $5, $7, 'what is meekness', '{"text":"strength held"}'),
  ($3, $6, $8, 'her question', '{"text":"hers"}')`, [Q1, Q2, Q3, L1, L2, L3, U1, U2]);

await as(U1);
eq(await rpc('bible_pin_status'), { has_pin: false, hidden_count: 0, locked_until: null }, 'no PIN yet');
eq((await db.query('select context from public.bible_guidance order by context')).rows.map(r => r.context), ['one', 'two'], 'sees own visible letters');
eq(await questions(), ['what is meekness', 'who was david'], 'and the study under them');
let ins = 'no error'; try { await db.query(`insert into public.bible_study (guidance_id, user_id, question, answer) values ($1, $2, 'x', '{}')`, [L1, U1]) } catch (e) { ins = e.message }
eq(ins, 'permission denied for table bible_study', 'only the function may write a study row');
eq(await rpc('bible_hidden_letters', ['1234']), { ok: false, error: 'pin_not_set' }, 'hidden letters need a PIN to exist first');
eq((await rpc('bible_hide', [L1])).error, 'pin_not_set', 'nothing can be hidden before a PIN exists');
eq(await rpc('bible_set_pin', ['12']), { ok: false, error: 'bad_pin' }, 'a PIN is 4–8 digits');
eq(await rpc('bible_set_pin', ['1234']), { ok: true }, 'set a PIN');
eq(await rpc('bible_set_pin', ['5678', '0000']), { ok: false, error: 'wrong_pin', attempts_left: 4 }, 'changing it needs the old one');
eq(await rpc('bible_set_pin', ['5678', '1234']), { ok: true }, 'and works with it');
eq(await rpc('bible_pin_status'), { has_pin: true, hidden_count: 0, locked_until: null }, 'status knows');

// hide one: through the function, because Postgres holds an update's new row to the select policy
let plain = 'no error'; try { await db.query(`update public.bible_guidance set hidden = true where id = $1`, [L1]) } catch (e) { plain = e.message }
eq(plain, 'new row violates row-level security policy for table "bible_guidance"', 'a plain update cannot hide (the new row must stay visible)');
eq(await rpc('bible_hide', [L1]), { ok: true }, 'hiding goes through the function');
eq((await rpc('bible_hide', [L1])).error, 'not_found', 'twice is not found');
eq((await db.query('select context from public.bible_guidance order by context')).rows.map(r => r.context), ['two'], 'a hidden letter no longer comes back');
eq(await questions(), ['what is meekness'], 'and neither does its study');
eq((await db.query(`update public.bible_guidance set hidden = false where id = $1 returning context`, [L1])).rows, [], 'and cannot be unhidden by a plain update');
eq((await db.query(`delete from public.bible_guidance where id = $1 returning context`, [L1])).rows, [], 'nor deleted by a plain delete');
eq((await db.query(`delete from public.bible_study where id = $1 returning question`, [Q1])).rows, [], 'nor its study');
eq((await rpc('bible_pin_status')).hidden_count, 1, 'the count says one is hidden');

eq((await rpc('bible_hidden_letters', ['0000'])).error, 'wrong_pin', 'wrong PIN: nothing');
const ok = await rpc('bible_hidden_letters', ['5678']);
eq([ok.ok, ok.letters.map(l => l.context), ok.letters[0].hidden], [true, ['one'], true], 'right PIN: the hidden letter');
eq((await rpc('bible_pin_status')).locked_until, null, 'a right PIN clears the failed count');
eq((await rpc('bible_hidden_study', [L1, '0000'])).error, 'wrong_pin', 'a hidden study needs the PIN too');
const st = await rpc('bible_hidden_study', [L1, '5678']);
eq([st.ok, st.study.map(s => s.question), st.study[0].answer], [true, ['who was david'], { text: 'a shepherd' }], 'right PIN: the thread under the hidden letter');
eq((await rpc('bible_hidden_study', [L2, '5678'])).error, 'not_found', 'but not for a letter that is not hidden');
eq((await rpc('bible_hidden_study_delete', [Q2, '5678'])).error, 'not_found', 'deleting through the PIN door needs a hidden letter');
eq(await rpc('bible_hidden_study_delete', [Q1, '5678']), { ok: true }, 'a hidden letter\'s question can be removed with the PIN');
eq((await rpc('bible_hidden_study', [L1, '5678'])).study, [], 'and is gone');
await db.query('reset role');
await db.query(`insert into public.bible_study (id, guidance_id, user_id, question, answer) values ($1, $2, $3, 'who was david', '{"text":"a shepherd"}')`, [Q1, L1, U1]);
await as(U1);

const t = await rpc('bible_hidden_tick', [L1, 0, true, '5678']);
eq([t.ok, Object.keys(t.letter.plan_done)], [true, ['0']], 'ticking a reading on a hidden letter');
const u = await rpc('bible_hidden_tick', [L1, 0, false, '5678']);
eq([u.ok, u.letter.plan_done], [true, {}], 'and unticking');

// the other person
await as(U2);
eq((await db.query('select context from public.bible_guidance')).rows.map(r => r.context), ['hers'], 'the other account sees only her own');
eq(await questions(), ['her question'], 'and only her own study');
eq((await rpc('bible_hidden_letters', ['5678'])).error, 'pin_not_set', 'and has no PIN of her own');
eq((await rpc('bible_unhide', [L1, '5678'])).error, 'pin_not_set', 'and cannot unhide his even with his PIN');
eq((await rpc('bible_hidden_study', [L1, '5678'])).error, 'pin_not_set', 'nor read his hidden study');

// lockout
await as(U1);
for (let i = 0; i < 4; i++) await rpc('bible_hidden_letters', ['0000']);
const locked = await rpc('bible_hidden_letters', ['0000']);
eq([locked.ok, locked.error, typeof locked.locked_until], [false, 'pin_locked', 'string'], 'five wrong guesses lock it');
eq((await rpc('bible_hidden_letters', ['5678'])).error, 'pin_locked', 'even the right PIN waits');
eq(typeof (await rpc('bible_pin_status')).locked_until, 'string', 'status shows the lock');
await db.query('reset role');
await db.query(`update public.bible_prefs set pin_locked_until = now() - interval '1 minute' where user_id = $1`, [U1]);
await as(U1);
eq((await rpc('bible_hidden_letters', ['5678'])).ok, true, 'and opens again when the time is up');

const un = await rpc('bible_unhide', [L1, '5678']);
eq([un.ok, un.letter.hidden], [true, false], 'unhide with the PIN');
eq((await db.query('select context from public.bible_guidance order by context')).rows.map(r => r.context), ['one', 'two'], 'back in the open list');
eq(await questions(), ['what is meekness', 'who was david'], 'with its study back too');
eq((await db.query(`delete from public.bible_study where id = $1 returning question`, [Q2])).rows.map(r => r.question), ['what is meekness'], 'a visible letter\'s question can be removed plainly');
eq(await rpc('bible_hide', [L2]), { ok: true }, 'hide the second');
eq(await rpc('bible_hidden_delete', [L2, '5678']), { ok: true }, 'delete a hidden letter with the PIN');
eq((await rpc('bible_hidden_delete', [L2, '5678'])).error, 'not_found', 'twice is not found');
eq(await rpc('bible_hide', [L1]), { ok: true }, 'hide the first again');
eq(await rpc('bible_forget_pin'), { ok: true, deleted: 1 }, 'forgetting the PIN deletes the hidden letters');
eq(await rpc('bible_pin_status'), { has_pin: false, hidden_count: 0, locked_until: null }, 'and leaves a clean slate');
try { await db.query('select public.bible_check_pin($1)', ['5678']); console.log('✗ authenticated could call bible_check_pin'); failed++; } catch (e) { console.log('✓ the scorekeeper is not callable directly:', e.message); }
try { await db.query('select * from public.bible_prefs'); console.log('✗ authenticated could read bible_prefs'); failed++; } catch (e) { console.log('✓ the PIN table is not readable:', e.message); }
await db.query('reset role');
eq((await db.query('select question from public.bible_study where user_id = $1', [U1])).rows, [], 'the deleted letters took their study with them');
await db.end();
console.log(failed ? `\n${failed} failed.` : '\nAll good.');
process.exit(failed ? 1 : 0);
