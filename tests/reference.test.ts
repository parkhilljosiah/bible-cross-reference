// Run with: npm test   (Node strips the types itself; no test framework needed)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { completeReference, parseReference, suggestBooks, type BookInfo } from '../src/reference.ts'

const books: BookInfo[] = JSON.parse(readFileSync(new URL('../public/data/books.json', import.meta.url), 'utf8'))
const total = books.reduce((n, b) => n + b.count, 0)
const byAbbr = (abbr: string) => books.find((b) => b.abbr === abbr)!

/** Global index of a verse, computed independently of the parser. */
function at(abbr: string, chapter: number, verse: number): number {
  const b = byAbbr(abbr)
  return b.start + b.chapters.slice(0, chapter - 1).reduce((a, c) => a + c, 0) + verse - 1
}

function ok(input: string) {
  const r = parseReference(input, books)
  assert.ok(r.ok, `"${input}" should parse, got: ${r.ok ? '' : r.error}`)
  return r
}
function fails(input: string) {
  const r = parseReference(input, books)
  assert.ok(!r.ok, `"${input}" should be rejected`)
  return r.ok ? '' : r.error
}

test('a single verse, in the ways people write it', () => {
  for (const input of ['John 3:16', 'john 3:16', 'JOHN 3:16', 'Jn 3:16', 'jn3:16', 'John 3.16', 'John 3 16', ' John  3 : 16 ', 'Joh 3:16']) {
    const r = ok(input)
    assert.equal(r.lo, at('John', 3, 16), input)
    assert.equal(r.hi, r.lo, input)
    assert.equal(r.label, 'John 3:16')
  }
})

test('numbered books accept every common prefix', () => {
  for (const input of ['1 Cor 13:4', '1Cor 13:4', '1 Corinthians 13:4', 'I Corinthians 13:4', 'i cor 13:4', 'First Corinthians 13:4', '1st Corinthians 13:4', '1co13:4']) {
    assert.equal(ok(input).lo, at('1Cor', 13, 4), input)
  }
  assert.equal(ok('2 Kings 5:14').lo, at('2Kgs', 5, 14))
  assert.equal(ok('3 John 4').lo, at('3John', 1, 4))
  assert.equal(ok('II Timothy 3:16').lo, at('2Tim', 3, 16))
  assert.equal(ok('1 Sam 17:45').lo, at('1Sam', 17, 45))
})

test('verse ranges, chapters and chapter ranges', () => {
  let r = ok('1 Cor 13:4-7')
  assert.deepEqual([r.lo, r.hi], [at('1Cor', 13, 4), at('1Cor', 13, 7)])
  assert.equal(r.label, '1 Corinthians 13:4–7')
  r = ok('John 3:16–18') // en dash
  assert.equal(r.hi, at('John', 3, 18))
  r = ok('Psalm 23')
  assert.deepEqual([r.lo, r.hi], [at('Ps', 23, 1), at('Ps', 23, 6)])
  assert.equal(r.label, 'Psalms 23')
  r = ok('Ps 23-25')
  assert.deepEqual([r.lo, r.hi], [at('Ps', 23, 1), at('Ps', 25, 22)])
  r = ok('Gen 1:31-2:3')
  assert.deepEqual([r.lo, r.hi], [at('Gen', 1, 31), at('Gen', 2, 3)])
  assert.equal(r.label, 'Genesis 1:31 – 2:3')
})

test('a book on its own selects the whole book', () => {
  const r = ok('Revelation')
  assert.deepEqual([r.lo, r.hi], [byAbbr('Rev').start, total - 1])
  assert.equal(ok('rev').lo, byAbbr('Rev').start)
  assert.equal(ok('Genesis').lo, 0)
})

test('one-chapter books treat a lone number as a verse', () => {
  assert.equal(ok('Jude 5').lo, at('Jude', 1, 5))
  assert.equal(ok('Obadiah 1-5').hi, at('Obad', 1, 5))
  assert.equal(ok('Philemon 10').lo, at('Phlm', 1, 10))
  assert.equal(ok('Jude 1:5').lo, at('Jude', 1, 5)) // explicit chapter still fine
  assert.match(fails('Jude 2:1'), /just one chapter/)
})

test('edges of the Bible', () => {
  assert.equal(ok('Gen 1:1').lo, 0)
  assert.equal(ok('Rev 22:21').lo, total - 1)
})

test('over-long ranges are trimmed to the end of the chapter', () => {
  const r = ok('Gen 1:1-100')
  assert.equal(r.hi, at('Gen', 1, 31))
  assert.equal(ok('Ps 120-999').hi, at('Ps', 150, 6)) // Psalm 150 has 6 verses
})

test('alternative names', () => {
  assert.equal(ok('Song of Solomon 2:1').lo, at('Song', 2, 1))
  assert.equal(ok('Song of Songs 2:1').lo, at('Song', 2, 1))
  assert.equal(ok('SoS 2:1').lo, at('Song', 2, 1))
  assert.equal(ok('Psalms 119:105').lo, at('Ps', 119, 105))
  assert.equal(ok('Revelations 1:7').lo, at('Rev', 1, 7))
  assert.equal(ok('Phil 4:13').lo, at('Phil', 4, 13))
  assert.equal(ok('Philemon 1:10').lo, at('Phlm', 1, 10))
  assert.equal(ok('revel 1:7').lo, at('Rev', 1, 7)) // unique prefix
  assert.equal(ok('Matt. 5:3').lo, at('Matt', 5, 3)) // trailing period
})

test('every book parses by its name and by its abbreviation', () => {
  for (const b of books) {
    for (const input of [b.name, b.abbr]) {
      const r = parseReference(input, books)
      assert.ok(r.ok, `${input} -> ${r.ok ? '' : r.error}`)
      if (r.ok) assert.equal(r.lo, b.start, input)
    }
  }
})

test('bad input gets a helpful message', () => {
  assert.match(fails(''), /Type a verse/)
  assert.match(fails('   '), /Type a verse/)
  assert.match(fails('3:16'), /book name/)
  assert.match(fails('Genesis 51'), /50 chapters/)
  assert.match(fails('Revelation 23:1'), /22 chapters/)
  assert.match(fails('John 3:99'), /John 3 has 36 verses/)
  assert.match(fails('Psalm 0'), /150 chapters/)
  assert.match(fails('John 3:16-10'), /ends before it starts/)
  assert.match(fails('Ps 25-23'), /ends before it starts/)
  assert.match(fails('Genesis 1:31-1:3'), /ends before it starts/)
  assert.match(fails('John banana'), /Couldn't read “banana”/)
  assert.match(fails('Song of Solomon banana'), /Couldn't read “banana”/)
  assert.match(fails('Foo 3:16'), /No book called/)
})

test('ambiguous and unknown books suggest alternatives', () => {
  const jo = fails('Jo 3')
  assert.match(jo, /Did you mean/)
  assert.match(jo, /John|Joel|Job/)
  assert.match(fails('Joh 3:99'), /36 verses/) // "joh" is a real alias for John, so this is a verse error
  assert.match(fails('Phi 3'), /could be Philippians, Philemon/) // prefix shared by two books
})

test('misspelled book names get a "did you mean"', () => {
  assert.match(fails('Philipians 4:13'), /Did you mean Philippians/)
  assert.match(fails('Mathew 5:3'), /Did you mean Matthew/)
  assert.match(fails('Galations 3:28'), /Did you mean Galatians/)
  assert.match(fails('1 Thesalonians 4:16'), /Did you mean 1 Thessalonians/)
  assert.match(fails('Genisis 1:1'), /Did you mean Genesis/)
  assert.match(fails('Revalation 1:7'), /Did you mean Revelation/)
  assert.ok(!/Did you mean/.test(fails('Xylophone 3:16')), 'nothing close: no guess')
})

test('suggestions while typing', () => {
  const names = (input: string) => suggestBooks(input, books).map((b) => b.name)
  assert.equal(names('rev')[0], 'Revelation')
  assert.deepEqual(names('ph').slice(0, 2), ['Philippians', 'Philemon'])
  assert.ok(names('1 jo').includes('1 John'))
  assert.equal(names('1 jo')[0], '1 John')
  assert.equal(names('jn')[0], 'John')
  assert.deepEqual(names('xyz'), [])
  assert.deepEqual(names(''), [])
  assert.deepEqual(names('john 3'), [], 'no suggestions once a chapter is being typed')
  assert.ok(names('s').length <= 6)
})

// ---- completion: what to offer as a reference is typed ----

const nums = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

test('completion: a book name, then its chapters, then the verses', () => {
  let c = completeReference('john', books)
  assert.equal(c.stage, 'book')
  assert.equal(c.stage === 'book' && c.books[0].name, 'John')

  c = completeReference('john ', books) // a space after the name moves on to chapters
  assert.equal(c.stage, 'chapter')
  assert.deepEqual(c.stage === 'chapter' && c.chapters, nums(21))
  assert.equal(c.stage === 'chapter' && c.hint, null)

  c = completeReference('john 3:', books)
  assert.equal(c.stage, 'verse')
  assert.deepEqual(c.stage === 'verse' && c.verses, nums(36))
  assert.equal(c.stage === 'verse' && c.chapter, 3)
})

test('completion: typed digits narrow the list', () => {
  let c = completeReference('john 2', books) // 2, 20 and 21 all start with 2
  assert.deepEqual(c.stage === 'chapter' && c.chapters, [2, 20, 21])

  c = completeReference('john 3', books) // only chapter 3 starts with 3: go straight to its verses
  assert.equal(c.stage, 'verse')
  assert.equal(c.stage === 'verse' && c.chapter, 3)

  c = completeReference('john 3:1', books) // verses starting with 1: 1, 10-19
  assert.deepEqual(c.stage === 'verse' && c.verses, [1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19])

  c = completeReference('ps 15', books) // 15 and 150
  assert.deepEqual(c.stage === 'chapter' && c.chapters, [15, 150])
  c = completeReference('ps 150', books)
  assert.equal(c.stage === 'verse' && c.chapter, 150)
  assert.deepEqual(c.stage === 'verse' && c.verses, nums(6))
})

test('completion: the same shapes people type are understood', () => {
  for (const input of ['John 3.', 'John 3 :', 'john 3 ', 'John 3:']) {
    const c = completeReference(input, books)
    assert.equal(c.stage, 'verse', input)
    assert.equal(c.stage === 'verse' && c.chapter, 3, input)
  }
  assert.equal(completeReference('1 cor ', books).stage, 'chapter')
  assert.equal(completeReference('Song of Solomon ', books).stage, 'chapter')
})

test('completion: a chapter that does not exist says so and offers the real ones', () => {
  const c = completeReference('Philippians 5', books)
  assert.equal(c.stage, 'chapter')
  assert.equal(c.stage === 'chapter' && c.hint, 'Philippians has 4 chapters.')
  assert.deepEqual(c.stage === 'chapter' && c.chapters, [1, 2, 3, 4])

  const withColon = completeReference('Philippians 5:', books)
  assert.equal(withColon.stage === 'chapter' && withColon.hint, 'Philippians has 4 chapters.')

  assert.equal(completeReference('Genesis 51', books).stage === 'chapter' && completeReference('Genesis 51', books).hint, 'Genesis has 50 chapters.')
  assert.equal(completeReference('Psalms 151', books).stage === 'chapter' && completeReference('Psalms 151', books).hint, 'Psalms has 150 chapters.')
})

test('completion: a verse that does not exist says so and offers the real ones', () => {
  const c = completeReference('John 3:99', books)
  assert.equal(c.stage, 'verse')
  assert.equal(c.stage === 'verse' && c.hint, 'John 3 has 36 verses.')
  assert.deepEqual(c.stage === 'verse' && c.verses, nums(36))
})

test('completion: one-chapter books go straight to verses', () => {
  let c = completeReference('jude ', books)
  assert.equal(c.stage, 'verse')
  assert.deepEqual(c.stage === 'verse' && c.verses, nums(25))
  assert.equal(c.stage === 'verse' && c.chapter, 1)

  c = completeReference('jude 30', books)
  assert.equal(c.stage === 'verse' && c.hint, 'Jude has 25 verses.')

  c = completeReference('3 John 1', books) // 3 John has 14 verses: 1, 10-14
  assert.deepEqual(c.stage === 'verse' && c.verses, [1, 10, 11, 12, 13, 14])
  c = completeReference('Jude 1:5', books) // an explicit chapter 1 is fine too
  assert.equal(c.stage === 'verse' && c.verses.includes(5), true)
})

test('completion: nothing is offered when there is nothing to offer', () => {
  assert.equal(completeReference('', books).stage, 'none')
  assert.equal(completeReference('xyz', books).stage, 'none')
  assert.equal(completeReference('john 3:16-', books).stage, 'none') // a range is being typed by hand
  assert.equal(completeReference('john banana', books).stage, 'none')
})

test('completion agrees with the parser: every offered verse of John 3 parses', () => {
  const c = completeReference('john 3:', books)
  assert.equal(c.stage, 'verse')
  if (c.stage !== 'verse') return
  for (const v of c.verses) assert.ok(parseReference(`John 3:${v}`, books).ok, `John 3:${v}`)
  assert.ok(!parseReference(`John 3:${c.verses.length + 1}`, books).ok)
})
