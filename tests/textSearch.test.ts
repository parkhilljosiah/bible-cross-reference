import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseReference } from '../src/reference.ts'
import { buildIndex, countByBook, highlight, normalize, parseQuery, search } from '../src/textSearch.ts'

const verses = [
  /* 0 */ 'In the beginning God created the heaven and the earth.',
  /* 1 */ 'And Jesus saith unto him, The foxes have holes, and the Son of man hath not where to lay his head.',
  /* 2 */ 'A man’s heart deviseth his way: but the LORD directeth his steps.',
  /* 3 */ 'And she brought forth manna; and the woman rejoiced.',
  /* 4 */ 'The son of the man said unto the man, Give me the lamb.',
  /* 5 */ 'Love one another; as I have loved you.',
  /* 6 */ 'Behold, he cometh with clouds; and every eye shall see him. Amen.',
  /* 7 */ 'Naïve café owners: Café Zoë.',
]
const index = buildIndex(verses)
const hits = (text: string, mode: 'phrase' | 'words' = 'phrase') => [...search(index, parseQuery(text)!, mode)]

test('normalisation ignores case, punctuation and accents', () => {
  assert.equal(normalize("Son of Man!").trim(), 'son of man')
  assert.equal(normalize('Café, Zoë').trim(), 'cafe zoe')
  assert.equal(normalize('man’s').trim(), 'man s')
})

test('a query needs at least two letters', () => {
  assert.equal(parseQuery(''), null)
  assert.equal(parseQuery(' a '), null)
  assert.equal(parseQuery('!!'), null)
  assert.deepEqual(parseQuery('Son of man')?.words, ['son', 'of', 'man'])
})

test('phrase mode needs the words together and in order', () => {
  assert.deepEqual(hits('son of man'), [1])
  assert.deepEqual(hits('SON OF MAN'), [1])
  assert.deepEqual(hits('man of son'), [])
  assert.deepEqual(hits('love one another'), [5])
})

test('whole words only: man does not match woman, manna or mans', () => {
  assert.deepEqual(hits('man'), [1, 2, 4]) // verse 2 is "man’s", which splits at the apostrophe
  assert.deepEqual(hits('manna'), [3])
  assert.deepEqual(hits('wom'), [])
})

test('words mode finds the words anywhere in the verse', () => {
  assert.deepEqual(hits('son man', 'words'), [1, 4])
  assert.deepEqual(hits('son man', 'phrase'), [])
  assert.deepEqual(hits('lamb son', 'words'), [4])
  assert.deepEqual(hits('god earth', 'words'), [0])
  assert.deepEqual(hits('man', 'words'), hits('man', 'phrase'), 'one word: both modes agree')
})

test('accents and apostrophes', () => {
  assert.deepEqual(hits('cafe'), [7])
  assert.deepEqual(hits('café'), [7])
  assert.deepEqual(hits('man’s heart'), [2])
  assert.deepEqual(hits("man's heart"), [2], 'straight and curly apostrophes are the same')
})

test('highlighting marks the match and the pieces rebuild the verse', () => {
  const q = parseQuery('son of man')!
  const seg = highlight(verses[1], q, 'phrase')
  assert.equal(seg.map((s) => s.text).join(''), verses[1])
  assert.deepEqual(seg.filter((s) => s.hit).map((s) => s.text), ['Son of man'])

  const words = highlight(verses[4], parseQuery('son man')!, 'words')
  assert.deepEqual(words.filter((s) => s.hit).map((s) => s.text), ['son', 'man', 'man'])
  assert.equal(words.map((s) => s.text).join(''), verses[4])

  // The phrase "man hath" must not light up a lone "man" elsewhere
  const only = highlight(verses[4], parseQuery('man said')!, 'phrase')
  assert.deepEqual(only.filter((s) => s.hit).map((s) => s.text), ['man said'])

  // No match: one unmarked piece
  const none = highlight(verses[5], parseQuery('lamb')!, 'phrase')
  assert.deepEqual(none, [{ text: verses[5], hit: false }])
})

test('hits are counted per book', () => {
  const starts = [0, 10, 20, 30]
  assert.deepEqual(countByBook(Uint32Array.from([0, 3, 10, 11, 12, 35]), starts), [2, 3, 0, 1])
  assert.deepEqual(countByBook(new Uint32Array(0), starts), [0, 0, 0, 0])
})

test('search over the real KJV finds the classic phrases', () => {
  const books = JSON.parse(readFileSync(new URL('../public/data/books.json', import.meta.url), 'utf8'))
  const real: string[] = []
  for (const b of books) real.push(...JSON.parse(readFileSync(new URL(`../public/data/text/KJV/${b.abbr}.json`, import.meta.url), 'utf8')))
  assert.equal(real.length, 31102)
  const idx = buildIndex(real)
  const found = (t: string, m: 'phrase' | 'words' = 'phrase') => [...search(idx, parseQuery(t)!, m)]

  const sonOfMan = found('son of man')
  assert.ok(sonOfMan.length > 100, `expected 100+ hits, got ${sonOfMan.length}`)
  const lamb = found('lamb of god')
  assert.equal(lamb.length, 2) // John 1:29 and John 1:36
  const john = (r: string) => {
    const p = parseReference(r, books)
    assert.ok(p.ok)
    return p.ok ? p.lo : -1
  }
  assert.deepEqual(lamb, [john('John 1:29'), john('John 1:36')])
  assert.ok(found('for god so loved the world').includes(john('John 3:16')))
  assert.ok(found('god love', 'words').includes(john('1 John 4:8')))
  assert.ok(found('in the beginning')[0] === 0 && found('in the beginning').length > 3)
})
