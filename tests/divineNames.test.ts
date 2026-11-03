import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { restoreDivineNames } from '../scripts/divine-names.mjs'

const fix = (verse: string, original: string): string => restoreDivineNames(verse, original)

test('copies the small-caps capitalisation onto the matching words', () => {
  assert.equal(fix('The Lord is my shepherd; I shall not want.', 'The LORD is my shepherd; I shall not want.'), 'The LORD is my shepherd; I shall not want.')
  assert.equal(fix('and the Lord God said', 'and the LORD God said'), 'and the LORD God said')
  assert.equal(fix('the Lord God hath spoken', 'the Lord GOD hath spoken'), 'the Lord GOD hath spoken')
  assert.equal(fix('O Lord, Lord God, the Lord’s doing', 'O LORD, Lord GOD, the LORD’s doing'), 'O LORD, Lord GOD, the LORD’s doing')
})

test('words that are the generic "God" or the title "Lord" stay as they are', () => {
  assert.equal(fix('In the beginning God created', 'In the beginning God created'), 'In the beginning God created')
  assert.equal(fix('The Lord said unto my Lord', 'The LORD said unto my Lord'), 'The LORD said unto my Lord')
})

test('only the capitalisation changes: other wording and punctuation of the verse are kept', () => {
  // The shipped text carries the psalm title; the older source does not.
  assert.equal(
    fix('A Psalm of David. The Lord is my shepherd; I shall not want.', 'The LORD is my shepherd; I shall not want.'),
    'A Psalm of David. The LORD is my shepherd; I shall not want.',
  )
  assert.equal(fix('And he said, "The Lord, the Lord."', 'And he said, The LORD, the LORD.'), 'And he said, "The LORD, the LORD."')
})

test('a margin note appended after the verse in the older source is ignored', () => {
  assert.equal(
    fix('Because the Lord hath sworn that the Lord will have war', 'Because the LORD hath sworn that the LORD will have war with Amalek: Heb. the hand upon the throne of the LORD'),
    'Because the LORD hath sworn that the LORD will have war',
  )
})

test('nothing is guessed when the words do not line up', () => {
  // The shipped verse has MORE Lord/God words than the older one (a title only the shipped text has).
  assert.equal(fix('A Psalm, the servant of the Lord. O Lord my God', 'O LORD my God'), 'A Psalm, the servant of the Lord. O Lord my God')
  // Different words in a different order.
  assert.equal(fix('the Lord God', 'the GOD Lord'), 'the Lord God')
  // No such words at all.
  assert.equal(fix('In the beginning', 'In the beginning'), 'In the beginning')
  assert.equal(fix('The Lord is good', ''), 'The Lord is good')
})

test('whole words only: godly, Godhead, lordship and plurals are left alone', () => {
  assert.equal(fix('a godly man of the Lord', 'a godly man of the LORD'), 'a godly man of the LORD')
  assert.equal(fix('lords and gods and the Godhead', 'LORDS and GODS and the GODHEAD'), 'lords and gods and the Godhead')
})

// ---- the shipped text ----

const books = JSON.parse(readFileSync(new URL('../public/data/books.json', import.meta.url), 'utf8'))
const kjv = (abbr: string) => JSON.parse(readFileSync(new URL(`../public/data/text/KJV/${abbr}.json`, import.meta.url), 'utf8')) as string[]
const verse = (abbr: string, chapter: number, v: number): string => {
  const b = books.find((x: { abbr: string }) => x.abbr === abbr)
  return kjv(abbr)[b.chapters.slice(0, chapter - 1).reduce((a: number, c: number) => a + c, 0) + v - 1]
}

test('the shipped KJV prints the divine name in capitals where the KJV does', () => {
  assert.match(verse('Ps', 23, 1), /The LORD is my shepherd/)
  assert.match(verse('Ps', 100, 1), /unto the LORD/)
  assert.match(verse('Ps', 110, 1), /The LORD said unto my Lord/)
  assert.match(verse('Exod', 3, 15), /The LORD God of your fathers/)
  assert.match(verse('Exod', 17, 16), /Because the LORD hath sworn that the LORD will have war/)
  assert.match(verse('Gen', 2, 4), /LORD God/)
  assert.match(verse('Gen', 1, 1), /In the beginning God created/) // the generic word stays "God"
  assert.doesNotMatch(verse('Gen', 1, 1), /GOD/)
})

test('the divine name is restored across the whole Bible, not just in the verses spot-checked above', () => {
  // Measured: 5,545 verses print the small-caps LORD (the Hebrew name YHWH, about 6,800 times). A broken restore step would drop this
  // to nearly zero, so a floor just under the measured count guards against that without being brittle.
  let withLord = 0
  for (const b of books) for (const v of kjv(b.abbr)) if (/\bLORD\b/.test(v)) withLord++
  assert.ok(withLord >= 5500, `expected at least 5,500 verses with LORD, got ${withLord}`)
})

test('the three known unrestored verses are exactly the psalm titles', () => {
  for (const [c, v] of [[7, 1], [18, 1], [102, 1]]) assert.doesNotMatch(verse('Ps', c, v), /\bLORD\b/, `Ps ${c}:${v} (known gap)`)
})
