// Checks the parsing the unfurl edge function does: prices in SA and European formats, meta tags,
// JSON-LD product blocks, and the addresses it must refuse to fetch. Run with: npm run unfurl-test

import { assertPublicHttpUrl, decodeEntities, meta, fromJsonLd, parsePrice, priceFromBody } from '../supabase/functions/unfurl/index.ts'

let fails = 0
const eq = (got: unknown, want: unknown, label: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fails++
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label} → ${JSON.stringify(got)}${ok ? '' : ` (wanted ${JSON.stringify(want)})`}`)
}
const throws = (fn: () => unknown, label: string) => {
  try { fn(); fails++; console.log(`  FAIL ${label} (did not throw)`) } catch { console.log(`  ok   ${label} refused`) }
}

console.log('\nprice parsing (SA formats first)')
eq(parsePrice('R 1 299,00'), 1299, 'R 1 299,00')
eq(parsePrice('R1,299.00'), 1299, 'R1,299.00')
eq(parsePrice('1299'), 1299, 'bare 1299')
eq(parsePrice('R 89'), 89, 'R 89')
eq(parsePrice('12 999,95'), 12999.95, '12 999,95')
eq(parsePrice('1.299,00'), 1299, 'European 1.299,00')
eq(parsePrice('R 1,299'), 1299, 'thousands comma, no decimals')
eq(parsePrice('R0.00'), null, 'zero is not a price')
eq(parsePrice(''), null, 'empty')
eq(parsePrice(null), null, 'null')
eq(parsePrice('Out of stock'), null, 'no digits')

console.log('\nblocked addresses')
throws(() => assertPublicHttpUrl('http://localhost:8000/x'), 'localhost')
throws(() => assertPublicHttpUrl('http://127.0.0.1/x'), '127.0.0.1')
throws(() => assertPublicHttpUrl('http://169.254.169.254/latest/meta-data/'), 'cloud metadata')
throws(() => assertPublicHttpUrl('http://192.168.0.10/'), 'private LAN')
throws(() => assertPublicHttpUrl('http://10.1.2.3/'), '10.x')
throws(() => assertPublicHttpUrl('http://172.16.0.9/'), '172.16.x')
throws(() => assertPublicHttpUrl('file:///etc/passwd'), 'file://')
throws(() => assertPublicHttpUrl('http://[::1]/'), 'IPv6 loopback')
eq(assertPublicHttpUrl('https://www.builders.co.za/p/123').hostname, 'www.builders.co.za', 'a real shop is allowed')
eq(assertPublicHttpUrl('http://8.8.8.8/').hostname, '8.8.8.8', 'public IP allowed')

console.log('\nmeta tags')
const og = `<html><head>
<meta property="og:title" content="Brass bar handle 160mm &amp; screws">
<meta content="Handle Studio" property="og:site_name">
<meta name="twitter:image" content="/img/handle.jpg">
<title>Ignore me</title></head><body></body></html>`
eq(meta(og, ['og:title']), 'Brass bar handle 160mm & screws', 'og:title, entities decoded')
eq(meta(og, ['og:site_name']), 'Handle Studio', 'reversed attribute order')
eq(meta(og, ['og:image', 'twitter:image']), '/img/handle.jpg', 'falls through to twitter:image')
eq(meta(og, ['og:price:amount']), null, 'missing tag')

console.log('\nJSON-LD')
const ld = `<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Sage enamel 5L",
 "image":["https://cdn.example.com/paint.jpg"],
 "offers":{"@type":"Offer","price":"1299.00","priceCurrency":"ZAR"}}
</script>`
const parsed = fromJsonLd(ld)
eq(parsed.title, 'Sage enamel 5L', 'JSON-LD title')
eq(parsed.price, 1299, 'JSON-LD price')
eq(parsed.currency, 'ZAR', 'JSON-LD currency')
eq(parsed.image, 'https://cdn.example.com/paint.jpg', 'JSON-LD image (array)')
eq(fromJsonLd('<script type="application/ld+json">{ broken json</script>').price, undefined, 'broken JSON-LD is ignored')

console.log('\nbody fallback')
eq(priceFromBody('<body><span class="price">R 2 450,00</span></body>'), 2450, 'price in the body')
eq(priceFromBody('<script>var price = "R 99"</script><body>Nothing here</body>'), null, 'ignores scripts')

console.log('\nentities')
eq(decodeEntities('Paint &amp; brushes &#8212; 5&nbsp;L'), 'Paint & brushes — 5 L', 'named + numeric')

console.log(fails ? `\n${fails} failing` : '\nAll unfurl parsing checks passed.')
if (fails) process.exit(1)
