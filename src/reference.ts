// Parses what people type into a search box ("John 3:16", "jn 3.16", "1 Cor 13:4-7", "Ps 23", "Jude 5") into a range of
// global verse indices. Pure and dependency-free (type-only imports) so it can be tested with `node --test`.

/** The slice of a book this module needs. `chapters[i]` is the number of verses in chapter i + 1. */
export interface BookInfo {
  name: string
  abbr: string
  chapters: number[]
  /** Global index of the book's first verse. */
  start: number
}

export type ParseResult = { ok: true; lo: number; hi: number; label: string } | { ok: false; error: string }

// Alternative spellings per book, keyed by the OpenBible abbreviation. Matching ignores case, spaces and periods, and
// numbered books also accept "I", "1st" and "First" in front (handled in splitInput). Short forms that would be
// ambiguous (ez, es, jo, jud, ph, co) are left out on purpose; a typo like "jo 3" gets a "did you mean" instead.
const ALIASES: Record<string, string> = {
  Gen: 'ge gn',
  Exod: 'ex exo',
  Lev: 'le lv',
  Num: 'nu nm nb',
  Deut: 'deu dt',
  Josh: 'jos jsh',
  Judg: 'jdg jg jdgs',
  Ruth: 'rth ru',
  '1Sam': '1sa 1sm 1s',
  '2Sam': '2sa 2sm 2s',
  '1Kgs': '1ki 1kin 1k 1kings',
  '2Kgs': '2ki 2kin 2k 2kings',
  '1Chr': '1ch 1chron 1chronicles',
  '2Chr': '2ch 2chron 2chronicles',
  Ezra: 'ezr',
  Neh: 'ne',
  Esth: 'est',
  Job: 'jb',
  Ps: 'psalm psa pss psm pslm',
  Prov: 'pro prv pr',
  Eccl: 'ecc ecl qoh eccles',
  Song: 'songofsongs sos ss canticles cant songs sng',
  Isa: 'is',
  Jer: 'je jr',
  Lam: 'la',
  Ezek: 'eze ezk',
  Dan: 'da dn',
  Hos: 'ho',
  Joel: 'jl',
  Amos: 'am',
  Obad: 'ob oba',
  Jonah: 'jon jnh',
  Mic: 'mc',
  Nah: 'na',
  Hab: 'hb',
  Zeph: 'zep zp',
  Hag: 'hg',
  Zech: 'zec zc',
  Mal: 'ml',
  Matt: 'mat mt',
  Mark: 'mrk mar mk mr',
  Luke: 'luk lk',
  John: 'joh jhn jn',
  Acts: 'act ac',
  Rom: 'ro rm',
  '1Cor': '1co',
  '2Cor': '2co',
  Gal: 'ga',
  Eph: 'ephes',
  Phil: 'php pp',
  Col: 'colossians',
  '1Thess': '1th 1thes',
  '2Thess': '2th 2thes',
  '1Tim': '1ti',
  '2Tim': '2ti',
  Titus: 'tit',
  Phlm: 'phm philem',
  Heb: '',
  Jas: 'jam jm',
  '1Pet': '1pe 1pt',
  '2Pet': '2pe 2pt',
  '1John': '1jn 1jo 1joh',
  '2John': '2jn 2jo 2joh',
  '3John': '3jn 3jo 3joh',
  Jude: '',
  Rev: 're rv revelations apocalypse revelationofjohn',
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

interface Index {
  /** Alias or name (normalized) -> book index. Spellings that two books share are dropped. */
  exact: Map<string, number>
  /** Normalized full names, for prefix matching ("revel" -> Revelation). */
  names: string[]
}

const indexCache = new WeakMap<readonly BookInfo[], Index>()

function indexOf(books: readonly BookInfo[]): Index {
  const cached = indexCache.get(books)
  if (cached) return cached
  const exact = new Map<string, number>()
  const clash = new Set<string>()
  const add = (k: string, i: number) => {
    if (!k) return
    if (exact.has(k) && exact.get(k) !== i) clash.add(k)
    else exact.set(k, i)
  }
  books.forEach((b, i) => {
    add(key(b.name), i)
    add(key(b.abbr), i)
    for (const a of (ALIASES[b.abbr] ?? '').split(' ')) add(key(a), i)
  })
  clash.forEach((k) => exact.delete(k))
  const index = { exact, names: books.map((b) => key(b.name)) }
  indexCache.set(books, index)
  return index
}

/**
 * Separates "1 John 3:16" into the book part and the numbers: { ordinal: 1, letters: 'john', rest: '3:16' }.
 * Ordinals may be 1/2/3, "1st", "I/II/III" (needs a space after) or "First/Second/Third".
 */
function splitInput(input: string): { ordinal: number; letters: string; words: string[]; rest: string } {
  let s = input.trim().toLowerCase()
  let ordinal = 0
  const word = s.match(/^(first|second|third)\s+/)
  const roman = s.match(/^(iii|ii|i)\s+(?=[a-z])/)
  const digit = s.match(/^([123])(?:st|nd|rd)?\s*(?=[a-z])/)
  if (word) ordinal = ['first', 'second', 'third'].indexOf(word[1]) + 1
  else if (roman) ordinal = roman[1].length
  else if (digit) ordinal = Number(digit[1])
  const m = word ?? roman ?? digit
  if (m) s = s.slice(m[0].length)
  const book = s.match(/^[a-z .'’]+/)
  const letters = (book?.[0] ?? '').replace(/[^a-z]/g, '')
  const words = (book?.[0] ?? '').split(/[^a-z]+/).filter(Boolean)
  const rest = s.slice(book?.[0].length ?? 0).trim()
  return { ordinal, letters, words, rest }
}

const bookKey = (ordinal: number, letters: string) => (ordinal ? String(ordinal) : '') + letters

function verseIndex(b: BookInfo, chapter: number, verse: number): number {
  let idx = b.start
  for (let c = 0; c < chapter - 1; c++) idx += b.chapters[c]
  return idx + verse - 1
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Turns text such as "John 3:16-18" into a verse range, or says what is wrong with it. */
export function parseReference(input: string, books: readonly BookInfo[]): ParseResult {
  if (!input.trim()) return { ok: false, error: 'Type a verse, such as John 3:16.' }
  const { ordinal, letters, words, rest: afterBook } = splitInput(input)
  if (!letters) return { ok: false, error: 'Start with a book name, such as John 3:16 or Ps 23.' }

  const { exact, names } = indexOf(books)
  const k = bookKey(ordinal, letters)
  let bi: number | undefined
  let rest = afterBook
  // Longest run of leading words that names a book ("Song of Solomon"); any words left over are reported as unreadable
  // ("John banana" is John followed by something we can't read, not a book called johnbanana).
  for (let n = words.length; n >= 1 && bi === undefined; n--) {
    const hit = exact.get(bookKey(ordinal, words.slice(0, n).join('')))
    if (hit !== undefined) {
      bi = hit
      rest = [...words.slice(n), afterBook].join(' ').trim()
    }
  }
  if (bi === undefined && letters.length >= 3) {
    // A unique prefix of a full name works too ("revel", "phili"); several matches means we should ask.
    const hits = names.flatMap((n, i) => (n.startsWith(k) ? [i] : []))
    if (hits.length === 1) bi = hits[0]
    else if (hits.length > 1) {
      const some = hits.slice(0, 4).map((i) => books[i].name).join(', ')
      return { ok: false, error: `“${input.trim()}” could be ${some}${hits.length > 4 ? ', …' : ''}. Add more letters.` }
    }
  }
  if (bi === undefined) {
    // Offer the closest books by the part we did recognise as a name (digits would otherwise hide every suggestion).
    const guesses = suggestBooks((ordinal ? `${ordinal} ` : '') + letters, books, 4)
    return {
      ok: false,
      error: guesses.length
        ? `No book called “${letters}”. Did you mean ${guesses.map((b) => b.name).join(', ')}?`
        : `No book called “${(ordinal ? ordinal + ' ' : '') + letters}”.`,
    }
  }

  const book = books[bi]
  const nChapters = book.chapters.length
  const single = nChapters === 1
  const label = (lo: number, hi: number, text: string) => ({ ok: true as const, lo, hi, label: `${book.name}${text}` })

  // Normalise the numbers: dashes, "3.16" and "3 16" all become the usual 3:16.
  let r = rest.replace(/[–—−]/g, '-').replace(/\s*-\s*/g, '-').replace(/\s*:\s*/g, ':')
  r = r.replace(/^(\d+)\.(\d+)/, '$1:$2').replace(/-(\d+)\.(\d+)$/, '-$1:$2')
  if (/^\d+\s+\d+$/.test(r) && !single) r = r.replace(/\s+/, ':')
  r = r.replace(/\s+/g, '')

  const chapterOk = (c: number): string | null =>
    c >= 1 && c <= nChapters ? null : single ? `${book.name} has just one chapter.` : `${book.name} has ${plural(nChapters, 'chapter')}.`
  const verseOk = (c: number, v: number): string | null =>
    v >= 1 && v <= book.chapters[c - 1] ? null : `${book.name} ${c} has ${plural(book.chapters[c - 1], 'verse')}.`
  const fail = (error: string | null): ParseResult | null => (error ? { ok: false, error } : null)

  if (r === '') return label(book.start, book.start + book.chapters.reduce((a, b) => a + b, 0) - 1, '')

  let m: RegExpMatchArray | null
  // "Jude 5" and "Obadiah 1-5": in a one-chapter book the lone number is a verse.
  if (single && (m = r.match(/^(\d+)(?:-(\d+))?$/))) {
    const v1 = Number(m[1])
    const v2 = m[2] ? Number(m[2]) : v1
    const bad = fail(verseOk(1, v1))
    if (bad) return bad
    if (v2 < v1) return { ok: false, error: 'The range ends before it starts.' }
    const end = Math.min(v2, book.chapters[0])
    return label(verseIndex(book, 1, v1), verseIndex(book, 1, end), end === v1 ? ` ${v1}` : ` ${v1}–${end}`)
  }
  // Whole chapter: "Psalm 23"
  if ((m = r.match(/^(\d+)$/))) {
    const c = Number(m[1])
    const bad = fail(chapterOk(c))
    if (bad) return bad
    return label(verseIndex(book, c, 1), verseIndex(book, c, book.chapters[c - 1]), ` ${c}`)
  }
  // Chapter range: "Psalm 23-25"
  if ((m = r.match(/^(\d+)-(\d+)$/))) {
    const c1 = Number(m[1])
    const c2 = Math.min(Number(m[2]), nChapters)
    const bad = fail(chapterOk(c1))
    if (bad) return bad
    if (c2 < c1) return { ok: false, error: 'The range ends before it starts.' }
    return label(verseIndex(book, c1, 1), verseIndex(book, c2, book.chapters[c2 - 1]), c2 === c1 ? ` ${c1}` : ` ${c1}–${c2}`)
  }
  // One verse: "John 3:16"
  if ((m = r.match(/^(\d+):(\d+)$/))) {
    const c = Number(m[1])
    const v = Number(m[2])
    const bad = fail(chapterOk(c) ?? verseOk(c, v))
    if (bad) return bad
    const i = verseIndex(book, c, v)
    return label(i, i, ` ${c}:${v}`)
  }
  // Verses in one chapter: "John 3:16-18"
  if ((m = r.match(/^(\d+):(\d+)-(\d+)$/))) {
    const c = Number(m[1])
    const v1 = Number(m[2])
    const v2 = Number(m[3])
    const bad = fail(chapterOk(c) ?? verseOk(c, v1))
    if (bad) return bad
    if (v2 < v1) return { ok: false, error: 'The range ends before it starts.' }
    const end = Math.min(v2, book.chapters[c - 1])
    return label(verseIndex(book, c, v1), verseIndex(book, c, end), end === v1 ? ` ${c}:${v1}` : ` ${c}:${v1}–${end}`)
  }
  // Across chapters: "Genesis 1:31-2:3"
  if ((m = r.match(/^(\d+):(\d+)-(\d+):(\d+)$/))) {
    const [c1, v1, c2, v2] = m.slice(1).map(Number)
    const bad = fail(chapterOk(c1) ?? verseOk(c1, v1) ?? chapterOk(c2))
    if (bad) return bad
    if (c2 < c1 || (c2 === c1 && v2 < v1)) return { ok: false, error: 'The range ends before it starts.' }
    const end = Math.min(v2, book.chapters[c2 - 1])
    return label(verseIndex(book, c1, v1), verseIndex(book, c2, end), ` ${c1}:${v1} – ${c2}:${end}`)
  }
  return { ok: false, error: `Couldn't read “${rest}” after ${book.name}. Try ${book.name} ${single ? '5' : '3:16'} or ${book.name}${single ? '' : ' 3'}.` }
}

/** Books matching what has been typed so far, for the suggestion list. Empty once chapter numbers appear. */
export function suggestBooks(input: string, books: readonly BookInfo[], limit = 6): BookInfo[] {
  const { ordinal, letters, rest } = splitInput(input)
  if (!letters || rest) return []
  const k = bookKey(ordinal, letters)
  const { exact } = indexOf(books)
  const out: number[] = []
  const push = (i: number) => {
    if (!out.includes(i)) out.push(i)
  }
  const exactHit = exact.get(k)
  if (exactHit !== undefined) push(exactHit)
  // Names first, then any other spelling, each in canonical order.
  books.forEach((b, i) => {
    if (key(b.name).startsWith(k)) push(i)
  })
  for (const [alias, i] of exact) if (alias.startsWith(k)) push(i)
  return out.slice(0, limit).map((i) => books[i])
}
