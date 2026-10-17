// Verifies every evidence quote in the mock results is findable in its PDF
// using the same matching rule as PdfViewer. Run: node scripts/check-quotes.mjs
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const src = readFileSync(new URL('../src/mock/results.ts', import.meta.url), 'utf8')
const norm = (s) => s.replace(/\s+/g, ' ').trim()
const hh = { A: 'A_qualifies', B: 'B_missing_docs', C: 'C_needs_review' }
const re = /ev\((A|B|C), '([^']+)', (\d+), '([^']+)'\)/g
let failures = 0, total = 0
for (const [, key, file, page, quote] of src.matchAll(re)) {
  total++
  const data = new Uint8Array(readFileSync(new URL(`../public/demo/${hh[key]}/${file}`, import.meta.url)))
  const doc = await getDocument({ data }).promise
  const tc = await (await doc.getPage(Number(page))).getTextContent()
  const joined = tc.items.map((i) => norm(i.str ?? '')).filter(Boolean).join(' ')
  const ok = joined.includes(norm(quote))
  if (!ok) failures++
  console.log(`${ok ? 'OK  ' : 'MISS'} ${hh[key]}/${file} p${page}: ${quote}`)
}
console.log(`\n${total - failures}/${total} quotes found`)
process.exit(failures ? 1 : 0)
