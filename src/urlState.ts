import type { Data } from './data'
import { DEFAULT_FILTERS, type Filters, type Selection } from './graph'

export interface AppState {
  filters: Filters
  pinned: Selection | null
}

// ?between=Rev&and=Dan,Ezek&votes=6&zoom=1&src=curated&sel=Rev            (a whole book)
//                                                       &sel=Rev.1.7       (a verse)
//                                                       &sel=Ps.22.1-Ps.22.31

const verseRef = (d: Data, v: number) => `${d.books[d.bookOf[v]].abbr}.${d.chapterOf[v]}.${d.verseOf[v]}`

function parseVerse(d: Data, ref: string): number | null {
  const [abbr, ch, vs] = ref.split('.')
  const book = d.books.find((b) => b.abbr === abbr)
  const c = Number(ch)
  const v = Number(vs)
  if (!book || !Number.isInteger(c) || !Number.isInteger(v)) return null
  if (c < 1 || c > book.chapters.length || v < 1 || v > book.chapters[c - 1]) return null
  let idx = book.start
  for (let i = 0; i < c - 1; i++) idx += book.chapters[i]
  return idx + v - 1
}

function parseBooks(d: Data, value: string | null): number[] {
  if (!value) return []
  const out: number[] = []
  for (const abbr of value.split(',')) {
    const i = d.books.findIndex((b) => b.abbr === abbr)
    if (i >= 0 && !out.includes(i)) out.push(i)
  }
  return out
}

/** Returns null when the URL carries no state, so the app keeps its defaults. */
export function readState(d: Data, search: string): AppState | null {
  const p = new URLSearchParams(search)
  if (![...p.keys()].some((k) => ['between', 'and', 'votes', 'zoom', 'src', 'sel'].includes(k))) return null

  const between = parseBooks(d, p.get('between'))
  const and = parseBooks(d, p.get('and'))
  const votes = Number(p.get('votes'))
  const filters: Filters = {
    minVotes: p.has('votes') && Number.isFinite(votes) ? Math.max(0, Math.min(60, votes)) : DEFAULT_FILTERS.minVotes,
    between,
    and,
    zoom: p.get('zoom') === '1' && (between.length > 0 || and.length > 0),
    source: p.get('src') === 'curated' ? 'curated' : 'all',
  }

  let pinned: Selection | null = null
  const sel = p.get('sel')
  if (sel) {
    const book = d.books.find((b) => b.abbr === sel)
    if (book) {
      pinned = { lo: book.start, hi: book.start + book.count - 1 }
    } else {
      const [from, to] = sel.split('-')
      const lo = parseVerse(d, from)
      const hi = to ? parseVerse(d, to) : lo
      if (lo !== null && hi !== null && hi >= lo) pinned = { lo, hi }
    }
  }
  return { filters, pinned }
}

/** Query string (with leading "?", or empty) that reproduces the state; defaults are omitted. */
export function writeState(d: Data, { filters, pinned }: AppState): string {
  const p = new URLSearchParams()
  const abbrs = (list: number[]) => list.map((i) => d.books[i].abbr).join(',')
  if (filters.between.length) p.set('between', abbrs(filters.between))
  if (filters.and.length) p.set('and', abbrs(filters.and))
  if (filters.minVotes !== DEFAULT_FILTERS.minVotes) p.set('votes', String(filters.minVotes))
  if (filters.zoom) p.set('zoom', '1')
  if (filters.source === 'curated') p.set('src', 'curated')
  if (pinned) {
    const book = d.books[d.bookOf[pinned.lo]]
    const whole = pinned.lo === book.start && pinned.hi === book.start + book.count - 1
    p.set(
      'sel',
      whole
        ? book.abbr
        : pinned.lo === pinned.hi
          ? verseRef(d, pinned.lo)
          : `${verseRef(d, pinned.lo)}-${verseRef(d, pinned.hi)}`,
    )
  }
  const s = p.toString().replace(/%2C/g, ',')
  return s ? `?${s}` : ''
}
