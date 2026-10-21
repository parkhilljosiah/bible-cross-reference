import type { Data } from './data'

export interface Filters {
  /** Votes needed for a plain cross-reference to show; curated links always show. */
  minVotes: number
  /** Book indices. With only `between` set, links touching those books are shown;
   *  with `and` also set, only links running between the two groups. */
  between: number[]
  and: number[]
  /** Compress the baseline to just the chosen books. */
  zoom: boolean
  /** 'curated' keeps only hand-picked quotations, allusions and echoes. */
  source: 'all' | 'curated'
}

export const DEFAULT_FILTERS: Filters = { minVotes: 4, between: [], and: [], zoom: false, source: 'all' }

export interface Selection {
  lo: number
  hi: number
}

export interface FilterContext {
  /** Which books are laid out on the baseline. */
  shown: boolean[]
  /** How arcs are colored: by reach (overview), by echoed book (zoomed) or by curated type. */
  colorBy: 'span' | 'book' | 'kind'
  passes: (link: number) => boolean
  /** Ids of every link that passes the filters. */
  links: Uint32Array
}

export function buildContext(d: Data, f: Filters): FilterContext {
  const nb = d.books.length
  const inA = new Uint8Array(nb)
  const inB = new Uint8Array(nb)
  f.between.forEach((b) => (inA[b] = 1))
  f.and.forEach((b) => (inB[b] = 1))
  const hasA = f.between.length > 0
  const hasB = f.and.length > 0

  const shown = new Array<boolean>(nb).fill(true)
  if (f.zoom && (hasA || hasB)) {
    for (let i = 0; i < nb; i++) shown[i] = !!(inA[i] || inB[i])
  }

  const { a, b, votes, bookOf, kind } = d
  const curatedOnly = f.source === 'curated'
  const passes = (e: number): boolean => {
    if (curatedOnly) {
      if (kind[e] === 0) return false
    } else if (kind[e] === 0 && votes[e] < f.minVotes) return false
    const ba = bookOf[a[e]]
    const bb = bookOf[b[e]]
    if (!shown[ba] || !shown[bb]) return false
    if (hasA) {
      if (hasB) {
        if (!((inA[ba] && inB[bb]) || (inB[ba] && inA[bb]))) return false
      } else if (!inA[ba] && !inA[bb]) return false
    }
    return true
  }

  const out = new Uint32Array(d.linkCount)
  let n = 0
  for (let e = 0; e < d.linkCount; e++) if (passes(e)) out[n++] = e
  const zoomed = shown.some((s) => !s)
  const colorBy = curatedOnly ? 'kind' : zoomed ? 'book' : 'span'
  return { shown, colorBy, passes, links: out.slice(0, n) }
}

/** Links that pass the filters and touch the verse range [lo, hi], each listed once. */
export function linksTouching(d: Data, ctx: FilterContext, lo: number, hi: number): number[] {
  const out: number[] = []
  for (let v = lo; v <= hi; v++) {
    for (let k = d.adjStart[v]; k < d.adjStart[v + 1]; k++) {
      const e = d.adj[k]
      const other = d.a[e] === v ? d.b[e] : d.a[e]
      // A link with both ends inside the range shows up from each end; keep one.
      if (other >= lo && other <= hi && other < v) continue
      if (ctx.passes(e)) out.push(e)
    }
  }
  return out
}

/** Horizontal zoom of the baseline: k >= 1, off = pixels scrolled from the left edge. */
export interface View {
  k: number
  off: number
}

export const IDENTITY_VIEW: View = { k: 1, off: 0 }
export const MAX_ZOOM = 400

export interface Layout {
  x0: Float64Array
  x1: Float64Array
  shown: boolean[]
  /** Pixels per verse. */
  ppv: number
  verseX: (v: number) => number
  /** Book under pixel x, or -1. `tolerance` is how far outside a book still counts (Infinity: nearest book). */
  bookAt: (x: number, tolerance?: number) => number
  /** Verse range under pixel column x, widened by `half` px but kept inside one book. */
  rangeAt: (x: number, half: number, snap?: boolean) => Selection | null
}

/**
 * Lays shown books out left to right across `width` pixels starting at `left`, then applies the
 * zoom: x' = left + (x - left) * k - off.
 */
export function makeLayout(
  d: Data,
  shown: boolean[],
  left: number,
  width: number,
  gap: number,
  view: View = IDENTITY_VIEW,
): Layout {
  const nb = d.books.length
  let total = 0
  let nShown = 0
  for (let i = 0; i < nb; i++) if (shown[i]) { total += d.books[i].count; nShown++ }
  const ppv = ((width - gap * Math.max(0, nShown - 1)) / Math.max(1, total)) * view.k
  const g = gap * view.k
  const x0 = new Float64Array(nb).fill(NaN)
  const x1 = new Float64Array(nb).fill(NaN)
  let cursor = left - view.off
  for (let i = 0; i < nb; i++) {
    if (!shown[i]) continue
    x0[i] = cursor
    x1[i] = cursor + d.books[i].count * ppv
    cursor = x1[i] + g
  }

  const verseX = (v: number) => {
    const bi = d.bookOf[v]
    return x0[bi] + (v - d.books[bi].start + 0.5) * ppv
  }
  const bookAt = (x: number, tolerance = Math.max(g, 1) + 1) => {
    let best = -1
    let bestDist = Infinity
    for (let i = 0; i < nb; i++) {
      if (!shown[i]) continue
      const dist = x < x0[i] ? x0[i] - x : x > x1[i] ? x - x1[i] : 0
      if (dist < bestDist) { best = i; bestDist = dist }
    }
    return bestDist <= tolerance ? best : -1
  }
  const rangeAt = (x: number, half: number, snap = false): Selection | null => {
    const bi = bookAt(x, snap ? Infinity : undefined)
    if (bi < 0) return null
    const book = d.books[bi]
    const toVerse = (px: number) => book.start + Math.floor((px - x0[bi]) / ppv)
    const clamp = (v: number) => Math.max(book.start, Math.min(book.start + book.count - 1, v))
    const lo = clamp(toVerse(x - half))
    const hi = clamp(toVerse(x + half))
    return { lo: Math.min(lo, hi), hi: Math.max(lo, hi) }
  }
  return { x0, x1, shown, ppv, verseX, bookAt, rangeAt }
}
