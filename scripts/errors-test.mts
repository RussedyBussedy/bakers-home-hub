/**
 * What the app says when an edge function call fails.
 *   npm run errors-test
 *
 * This is the code nobody sees until something is already wrong, which is exactly when a wrong
 * answer costs the most: "Is the unfurl function deployed?" sent someone to the Supabase dashboard
 * when the real trouble was a phone with one bar. Each failure now has to name itself.
 */
import { fnError } from '../src/data/supabaseDb'

let failed = 0
const like = (got: string, want: RegExp, label: string) => {
  const ok = want.test(got)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n    got  ${JSON.stringify(got)}\n    want ${want}`}`)
}

const http = (status: number, body = '') => ({
  name: 'FunctionsHttpError',
  message: 'Edge Function returned a non-2xx status code',
  context: new Response(body, { status }),
})

const msg = async (e: unknown) => (await fnError('link reader', e)).message

like(await msg(http(404)), /isn't set up on this Hub yet/i, 'a missing function says so, and only then')
like(await msg(http(401)), /sign-in has expired/i, 'an expired session is not a deployment problem')
like(await msg(http(403)), /sign-in has expired/i, 'nor is a refused one')
like(await msg(http(546)), /ran out of steam.*try again/i, 'a function killed for resources invites a retry')
like(await msg(http(500, 'TypeError: cannot read x')), /said: TypeError: cannot read x/, 'a crash shows what it actually said')
like(await msg(http(500)), /answered 500/, 'and falls back to the number when it said nothing')
like(await msg({ name: 'FunctionsFetchError', message: 'Failed to send a request' }), /check your connection/i, 'no signal reads as no signal')
like(await msg({ message: 'network error' }), /check your connection/i, 'however it is worded')
like(await msg({ message: 'something odd happened' }), /something odd happened/, 'anything else is passed through as-is')
like(await msg({}), /did not answer/i, 'and a silent failure still says something')

// The body is read from a clone, so the caller can still read the original.
const res = http(500, 'boom')
await fnError('link reader', res)
like(await res.context.text(), /^boom$/, 'reading the reason does not consume the response')

console.log(failed === 0 ? '\nAll good.' : `\n${failed} failed.`)
if (failed > 0) process.exit(1)
