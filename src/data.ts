export type Genre = 'Law' | 'History' | 'Wisdom' | 'Prophets' | 'Gospels' | 'Epistles' | 'Apocalyptic'

export interface Book {
  abbr: string
  name: string
  genre: Genre
  testament: 'OT' | 'NT'
  chapters: number[]
  /** Global index of the book's first verse. */
  start: number
  count: number
}

/** 0 is a plain cross-reference; the rest are curated link types. */
export const KIND_NAMES = ['', 'quotation', 'allusion', 'echo'] as const
export type KindName = (typeof KIND_NAMES)[number]

export interface Curated {
  type: KindName
  note: string
  /** Verse ranges (inclusive) at the a-end and b-end of the link. */
  aRange: [number, number]
  bRange: [number, number]
}

export interface Translation {
  id: string
  name: string
  year: string
  license: string
  /** Verses its base text omits (e.g. Matthew 17:21 in critical-text translations). */
  missing: number
}

export interface Data {
  books: Book[]
  translations: Translation[]
  totalVerses: number
  /** Cross-reference i links verse a[i] to verse b[i] (a < b), with community votes[i]. */
  a: Uint16Array
  b: Uint16Array
  votes: Int16Array
  /** 0 = plain cross-reference, 1 = quotation, 2 = allusion, 3 = echo. */
  kind: Uint8Array
  linkCount: number
  /** Details for curated links, keyed by link index. */
  curated: Map<number, Curated>
  curatedCount: number
  bookOf: Uint8Array
  chapterOf: Uint8Array
  verseOf: Uint8Array
  /** CSR adjacency: links touching verse v are adj[adjStart[v] .. adjStart[v + 1]). */
  adjStart: Uint32Array
  adj: Uint32Array
}

export const KIND_COLORS: Record<Exclude<KindName, ''>, string> = {
  quotation: '#ffd166',
  allusion: '#4fd8d0',
  echo: '#b58cff',
}

export const GENRE_COLORS: Record<Genre, string> = {
  Law: '#f2b84b',
  History: '#ef7b5c',
  Wisdom: '#6fcf97',
  Prophets: '#5aa9ff',
  Gospels: '#b58cff',
  Epistles: '#ff8fb8',
  Apocalyptic: '#4fd8d0',
}

const base = import.meta.env.BASE_URL

export async function loadData(): Promise<Data> {
  const [books, translations, buf, curatedRaw] = await Promise.all([
    fetch(`${base}data/books.json`).then((r) => r.json() as Promise<Book[]>),
    fetch(`${base}data/translations.json`).then((r) => r.json() as Promise<Translation[]>),
    fetch(`${base}data/refs.bin`).then((r) => r.arrayBuffer()),
    fetch(`${base}data/curated.json`).then(
      (r) =>
        r.json() as Promise<{ link: number; type: KindName; note: string; lo: [number, number]; hi: [number, number] }[]>,
    ),
  ])

  const totalVerses = books.reduce((n, b) => n + b.count, 0)
  const bookOf = new Uint8Array(totalVerses)
  const chapterOf = new Uint8Array(totalVerses)
  const verseOf = new Uint8Array(totalVerses)
  books.forEach((book, bi) => {
    let v = book.start
    book.chapters.forEach((verses, ci) => {
      for (let k = 0; k < verses; k++, v++) {
        bookOf[v] = bi
        chapterOf[v] = ci + 1
        verseOf[v] = k + 1
      }
    })
  })

  // 8-byte little-endian records: a:u16, b:u16, votes:i16, kind:u8, pad:u8.
  const u16 = new Uint16Array(buf)
  const i16 = new Int16Array(buf)
  const u8 = new Uint8Array(buf)
  const linkCount = u16.length / 4
  const a = new Uint16Array(linkCount)
  const b = new Uint16Array(linkCount)
  const votes = new Int16Array(linkCount)
  const kind = new Uint8Array(linkCount)
  const adjStart = new Uint32Array(totalVerses + 1)
  for (let i = 0; i < linkCount; i++) {
    a[i] = u16[i * 4]
    b[i] = u16[i * 4 + 1]
    votes[i] = i16[i * 4 + 2]
    kind[i] = u8[i * 8 + 6]
    adjStart[a[i] + 1]++
    adjStart[b[i] + 1]++
  }
  for (let v = 0; v < totalVerses; v++) adjStart[v + 1] += adjStart[v]
  const adj = new Uint32Array(linkCount * 2)
  const fill = adjStart.slice(0, totalVerses)
  for (let i = 0; i < linkCount; i++) {
    adj[fill[a[i]]++] = i
    adj[fill[b[i]]++] = i
  }

  const curated = new Map<number, Curated>()
  for (const c of curatedRaw) curated.set(c.link, { type: c.type, note: c.note, aRange: c.lo, bRange: c.hi })

  return {
    books, translations, totalVerses, a, b, votes, kind, linkCount, curated, curatedCount: curated.size,
    bookOf, chapterOf, verseOf, adjStart, adj,
  }
}

// Verse text is stored one file per book per translation, and only the books a reader opens are fetched.
const bookText = new Map<string, Promise<string[]>>()

function loadBookText(translation: string, abbr: string): Promise<string[]> {
  const key = `${translation}/${abbr}`
  let p = bookText.get(key)
  if (!p) {
    p = fetch(`${base}data/text/${key}.json`).then((r) => {
      if (!r.ok) throw new Error(`Couldn't load ${key} (${r.status})`)
      return r.json() as Promise<string[]>
    })
    p.catch(() => bookText.delete(key)) // allow a retry after a network failure
    bookText.set(key, p)
  }
  return p
}

/** Text of the verses lo..hi (global indices, inclusive) in a translation; '' where its base text omits a verse. */
export async function loadVerses(d: Data, translation: string, lo: number, hi: number): Promise<string[]> {
  const out: string[] = []
  for (let bi = d.bookOf[lo]; bi <= d.bookOf[hi]; bi++) {
    const book = d.books[bi]
    const text = await loadBookText(translation, book.abbr)
    const to = Math.min(hi, book.start + book.count - 1)
    for (let v = Math.max(lo, book.start); v <= to; v++) out.push(text[v - book.start] ?? '')
  }
  return out
}

export function verseLabel(d: Data, v: number): string {
  return `${d.books[d.bookOf[v]].abbr} ${d.chapterOf[v]}:${d.verseOf[v]}`
}

/** "Rev 13:1–5" style label for a contiguous verse range. */
export function rangeLabel(d: Data, lo: number, hi: number): string {
  const bLo = d.bookOf[lo]
  if (lo === hi) return verseLabel(d, lo)
  if (bLo !== d.bookOf[hi]) return `${verseLabel(d, lo)} – ${verseLabel(d, hi)}`
  const book = d.books[bLo]
  if (lo === book.start && hi === book.start + book.count - 1) return book.name
  if (d.chapterOf[lo] === d.chapterOf[hi]) return `${book.abbr} ${d.chapterOf[lo]}:${d.verseOf[lo]}–${d.verseOf[hi]}`
  return `${book.abbr} ${d.chapterOf[lo]}:${d.verseOf[lo]} – ${d.chapterOf[hi]}:${d.verseOf[hi]}`
}
