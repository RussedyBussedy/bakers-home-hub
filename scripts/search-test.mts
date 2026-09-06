/**
 * How product search results get ordered and filtered.
 *   npm run search-test
 *
 * The engine's job is to find things; this function's job is to make the list useful — drop what is
 * never a product page, never show the same shop twice, and float the shops that actually stock
 * house things above the rest without excluding anybody.
 */
import { isFavoured, isJunk, rank } from '../supabase/functions/search/index'

let failed = 0
function eq(got: unknown, want: unknown, label: string) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`)
}

const hit = (link: string, title = 'A thing', snippet = '') => ({ link, title, snippet })

// --- which shops count as ours --------------------------------------------
eq(isFavoured('builders.co.za'), true, 'a favoured shop')
eq(isFavoured('www.builders.co.za'), true, 'with www on the front')
eq(isFavoured('shop.builders.co.za'), true, 'and on a subdomain')
eq(isFavoured('BUILDERS.CO.ZA'), true, 'whatever the case')
eq(isFavoured('notbuilders.co.za'), false, 'but not a shop that merely ends the same way')
eq(isFavoured('example.com'), false, 'and not a stranger')

eq(isJunk('pinterest.com'), true, 'pinterest is never a product page')
eq(isJunk('za.pinterest.com'), true, 'nor its country sites')
eq(isJunk('en.wikipedia.org'), true, 'nor wikipedia')
eq(isJunk('builders.co.za'), false, 'a shop is not junk')

// --- ordering --------------------------------------------------------------
const mixed = rank([
  hit('https://en.wikipedia.org/wiki/Door_handle'),
  hit('https://smallshop.co.za/handle-1'),
  hit('https://www.builders.co.za/handle-2'),
  hit('https://za.pinterest.com/pin/12345'),
  hit('https://www.takealot.com/handle-3'),
  hit('https://another.co.za/handle-4'),
])
eq(mixed.map((h) => h.domain), ['builders.co.za', 'takealot.com', 'smallshop.co.za', 'another.co.za'],
  'shops we know come first, junk is dropped, everyone else keeps their order')
eq(mixed.map((h) => h.favoured), [true, true, false, false], 'and each one says which it is')

eq(rank([hit('https://www.builders.co.za/a'), hit('https://builders.co.za/b'), hit('https://www.builders.co.za/c')]).length,
  1, 'one result per shop — not ten colours of the same handle')

eq(rank([hit('https://a.co.za/x'), hit('https://b.co.za/y'), hit('https://c.co.za/z')], 2).map((h) => h.domain),
  ['a.co.za', 'b.co.za'], 'the limit is honoured')

// --- rubbish in ------------------------------------------------------------
eq(rank(undefined), [], 'no results at all')
eq(rank([]), [], 'an empty list')
eq(rank([{ link: 'https://a.co.za/x' }]), [], 'a result with no title is not shown')
eq(rank([{ title: 'No link here' }]), [], 'nor one with no address')
eq(rank([hit('not a url at all')]), [], 'nor one whose address will not parse')
eq(rank([{ link: 'https://a.co.za/x', title: 'T', snippet: 42 }])[0]?.snippet, '', 'a snippet that is not text becomes empty')

const long = rank([hit('https://a.co.za/x', 'T'.repeat(400), 'S'.repeat(400))])[0]!
eq(long.title.length, 160, 'a runaway title is trimmed')
eq(long.snippet.length, 220, 'and so is a runaway snippet')

console.log(failed === 0 ? '\nAll good.' : `\n${failed} failed.`)
if (failed > 0) process.exit(1)
