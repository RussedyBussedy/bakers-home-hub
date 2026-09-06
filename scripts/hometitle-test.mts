// The household name is composed into a title in three places; this is the rule.
import { homeTitle } from '../src/lib/utils'

let fails = 0
const eq = (got: string, want: string, label: string) => {
  const ok = got === want
  if (!ok) fails++
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label} → "${got}"${ok ? '' : ` (wanted "${want}")`}`)
}

eq(homeTitle('The Bakers'), 'The Bakers Hub', 'a family name gains Hub')
eq(homeTitle("Gran's Home"), "Gran's Home", 'a default new home is left alone')
eq(homeTitle('Smith Hub'), 'Smith Hub', 'already a Hub')
eq(homeTitle('Our House'), 'Our House', 'already a House')
eq(homeTitle('  The Bakers  '), 'The Bakers Hub', 'trimmed')
eq(homeTitle(''), 'Home Hub', 'empty')
eq(homeTitle(null), 'Home Hub', 'null')
eq(homeTitle(undefined), 'Home Hub', 'undefined')
eq(homeTitle('Homestead'), 'Homestead Hub', 'only a whole word counts')

console.log(fails ? `\n${fails} failing` : '\nHome title rule holds.')
if (fails) process.exit(1)
