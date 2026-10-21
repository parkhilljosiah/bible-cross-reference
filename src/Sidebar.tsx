import { useEffect, useMemo, useRef, useState } from 'react'
import { GENRE_COLORS, KIND_COLORS, loadVerses, rangeLabel, verseLabel, type Data } from './data'
import { linksTouching, type FilterContext, type Selection } from './graph'

interface Props {
  data: Data
  ctx: FilterContext
  pinned: Selection | null
  /** Narrow the diagram to links between the selection's books and `other`. */
  onCompare: (selectionBooks: number[], other: number) => void
  onClear: () => void
  onPin: (sel: Selection) => void
  translation: string
  /** A second translation shown beneath the first, or null. */
  compareTranslation: string | null
  onTranslations: (primary: string, compare: string | null) => void
}

const PAGE = 30

export default function Sidebar({
  data, ctx, pinned, onCompare, onClear, onPin, translation, compareTranslation, onTranslations,
}: Props) {
  const [open, setOpen] = useState<number | null>(null)
  const [limit, setLimit] = useState(PAGE)
  // Only used by the mobile bottom sheet.
  const [expanded, setExpanded] = useState(false)
  const [dragH, setDragH] = useState<number | null>(null)
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null)
  const justDragged = useRef(false)
  const sheetRef = useRef<HTMLElement>(null)

  const heightAt = (e: React.PointerEvent) => {
    const d = drag.current!
    return Math.max(0.12 * innerHeight, Math.min(0.85 * innerHeight, d.h - (e.clientY - d.y)))
  }
  const sheetHandlers = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      drag.current = { y: e.clientY, h: sheetRef.current!.getBoundingClientRect().height, moved: false }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current
      if (!d || (!d.moved && Math.abs(e.clientY - d.y) < 6)) return
      d.moved = true
      setDragH(heightAt(e))
    },
    onPointerUp: (e: React.PointerEvent) => {
      const d = drag.current
      if (!d?.moved) {
        drag.current = null
        return
      }
      const h = heightAt(e)
      drag.current = null
      // A drag ends in a click on the handle; swallow it so it doesn't also toggle.
      justDragged.current = true
      setTimeout(() => (justDragged.current = false), 0)
      setDragH(null)
      // Dragged most of the way down: dismiss. Otherwise snap to the nearer state.
      if (h < 0.28 * innerHeight) onClear()
      else setExpanded(h > 0.58 * innerHeight)
    },
    onPointerCancel: () => {
      drag.current = null
      setDragH(null)
    },
  }


  const detail = useMemo(() => {
    if (!pinned) return null
    const ids = linksTouching(data, ctx, pinned.lo, pinned.hi)
    const inside = (v: number) => v >= pinned.lo && v <= pinned.hi
    // Curated links first, then by community votes.
    const sorted = [...ids].sort(
      (x, y) => Number(data.kind[y] > 0) - Number(data.kind[x] > 0) || data.votes[y] - data.votes[x],
    )
    const perBook = new Map<number, number>()
    for (const e of ids) {
      const other = inside(data.a[e]) ? data.b[e] : data.a[e]
      const bi = data.bookOf[other]
      perBook.set(bi, (perBook.get(bi) ?? 0) + 1)
    }
    const top = [...perBook].sort((x, y) => y[1] - x[1]).slice(0, 8)
    const selBooks = [...new Set([data.bookOf[pinned.lo], data.bookOf[pinned.hi]])]
    return { total: ids.length, sorted, top, selBooks, inside }
  }, [data, ctx, pinned])

  // Busiest books under the current filters; shown on phones, where the intro text is hidden.
  const topBooks = useMemo(() => {
    if (pinned) return []
    const counts = new Uint32Array(data.books.length)
    for (const e of ctx.links) {
      const ba = data.bookOf[data.a[e]]
      const bb = data.bookOf[data.b[e]]
      counts[ba]++
      if (bb !== ba) counts[bb]++
    }
    return [...counts.keys()]
      .filter((bi) => counts[bi] > 0)
      .sort((x, y) => counts[y] - counts[x])
      .slice(0, 8)
      .map((bi) => [bi, counts[bi]] as const)
  }, [data, ctx, pinned])

  if (!pinned || !detail) {
    return (
      <aside className="sidebar intro">
        {topBooks.length > 0 && (
          <section className="top-books">
            <h3>Top connected books</h3>
            <ul className="bars">
              {topBooks.map(([bi, n]) => {
                const b = data.books[bi]
                return (
                  <li key={bi}>
                    <button onClick={() => onPin({ lo: b.start, hi: b.start + b.count - 1 })}>
                      <span className="bar-label">{b.name}</span>
                      <span
                        className="bar"
                        style={{ width: `${(n / topBooks[0][1]) * 100}%`, background: GENRE_COLORS[b.genre] }}
                      />
                      <span className="bar-n">{n.toLocaleString()}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
        <h2>Explore the arcs</h2>
        <p>
          Each arc joins two verses that cross-reference each other. Short arcs stay inside a book; the long, high
          ones reach across the canon.
        </p>
        <ul className="tips">
          <li>
            <strong>Click a book</strong> on the colored strip to light up every link from it and read the passages here.
            On a phone, <strong>slide your finger along the strip</strong> and lift on the book you want. Tap the
            selected book again to clear.
          </li>
          <li>
            <strong>Click the bars</strong> beneath the strip to select just a few verses at a time.
          </li>
          <li>
            <strong>Hover</strong> to see which book or verses you are over; nothing is drawn until you click.
          </li>
          <li>
            Use <strong>Between</strong> and <strong>And</strong> to compare books, such as <em>Revelation</em> with <em>Daniel</em> and <em>Ezekiel</em>.
          </li>
        </ul>
        <TranslationBar
          data={data}
          translation={translation}
          compareTranslation={compareTranslation}
          onChange={onTranslations}
        />
        <Legend />
        <KindLegend />
        <Credits />
      </aside>
    )
  }

  const { total, sorted, top, selBooks, inside } = detail
  const shownLinks = sorted.slice(0, limit)

  return (
    <aside
      ref={sheetRef}
      className={expanded ? 'sidebar sheet expanded' : 'sidebar sheet'}
      style={dragH === null ? undefined : { height: dragH, maxHeight: dragH }}
    >
      <button
        className="sheet-toggle"
        aria-expanded={expanded}
        onClick={() => {
          if (!justDragged.current) setExpanded(!expanded)
        }}
        {...sheetHandlers}
      >
        <span className="grabber" aria-hidden="true" />
        {expanded ? 'Collapse' : 'Expand'}
      </button>
      <div className="side-head">
        <h2>{rangeLabel(data, pinned.lo, pinned.hi)}</h2>
        <button className="ghost" onClick={onClear}>
          Clear
        </button>
      </div>
      <p className="muted">{total.toLocaleString()} links match the current filters.</p>
      <TranslationBar
        data={data}
        translation={translation}
        compareTranslation={compareTranslation}
        onChange={onTranslations}
      />

      {top.length > 0 && (
        <section>
          <h3>Most connected books</h3>
          <ul className="bars">
            {top.map(([bi, n]) => (
              <li key={bi}>
                <button
                  onClick={() => onCompare(selBooks, bi)}
                  title={`Show only links between ${data.books[selBooks[0]].name} and ${data.books[bi].name}`}
                >
                  <span className="bar-label">{data.books[bi].name}</span>
                  <span
                    className="bar"
                    style={{ width: `${(n / top[0][1]) * 100}%`, background: GENRE_COLORS[data.books[bi].genre] }}
                  />
                  <span className="bar-n">{n.toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Strongest links</h3>
        <ul className="links">
          {shownLinks.map((e) => {
            const here = inside(data.a[e]) ? data.a[e] : data.b[e]
            const there = here === data.a[e] ? data.b[e] : data.a[e]
            const isOpen = open === e
            const info = data.curated.get(e)
            const hereIsA = here === data.a[e]
            const ranges = info
              ? ([hereIsA ? info.aRange : info.bRange, hereIsA ? info.bRange : info.aRange] as const)
              : null
            return (
              <li key={e}>
                <button className="link" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e)}>
                  <span className="refs">
                    {verseLabel(data, here)} <span aria-label="links to">↔</span> {verseLabel(data, there)}
                  </span>
                  {info ? (
                    <span className="kind" style={{ color: KIND_COLORS[info.type as 'quotation'] }}>
                      {info.type}
                    </span>
                  ) : (
                    <span className="votes" title="Community votes">
                      {data.votes[e]}
                    </span>
                  )}
                </button>
                {isOpen && (
                  <div className="passages">
                    {info && info.note && <p className="note">{info.note}</p>}
                    {(ranges ?? [[here, here], [there, there]] as const).map(([lo, hi]) => (
                      <div key={lo} className="passage">
                        <b>{rangeLabel(data, lo, hi)}</b>
                        {([translation, compareTranslation].filter(Boolean) as string[]).map((tid, _i, all) => (
                          <p key={tid}>
                            {all.length > 1 && <span className="tr-tag">{tid}</span>}
                            <PassageText key={`${tid}-${lo}-${hi}`} data={data} tid={tid} lo={lo} hi={hi} />
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {sorted.length > limit && (
          <button className="ghost" onClick={() => setLimit(limit + PAGE)}>
            Show more
          </button>
        )}
      </section>
      <Credits />
    </aside>
  )
}

function Legend() {
  return (
    <section>
      <h3>Book colors</h3>
      <ul className="legend">
        {Object.entries(GENRE_COLORS).map(([genre, color]) => (
          <li key={genre}>
            <span className="swatch" style={{ background: color }} />
            {genre}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Loads and shows the first few verses of a range in one translation. Remounted when its inputs change. */
function PassageText({ data, tid, lo, hi }: { data: Data; tid: string; lo: number; hi: number }) {
  const [verses, setVerses] = useState<string[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    loadVerses(data, tid, lo, hi).then(
      (v) => live && setVerses(v),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [data, tid, lo, hi])

  if (failed) return <span className="muted">Couldn’t load this text. Check your connection and reopen the link.</span>
  if (!verses) return <span className="muted">Loading…</span>
  const shown = verses.slice(0, 6).filter(Boolean)
  // Critical-text translations leave out a few verses (e.g. Matthew 17:21) that the KJV includes.
  if (shown.length === 0) return <span className="muted">Not in this translation’s base text.</span>
  return (
    <>
      {shown.join(' ')}
      {verses.length > 6 ? ' …' : ''}
    </>
  )
}

function TranslationBar({
  data,
  translation,
  compareTranslation,
  onChange,
}: {
  data: Data
  translation: string
  compareTranslation: string | null
  onChange: (primary: string, compare: string | null) => void
}) {
  const label = (t: { id: string; name: string; year: string }) => `${t.name}${t.year ? ` (${t.year})` : ''}`
  return (
    <div className="translation-bar">
      <label>
        <span>Translation</span>
        <select
          value={translation}
          onChange={(e) => {
            const next = e.target.value
            onChange(next, compareTranslation === next ? null : compareTranslation)
          }}
        >
          {data.translations.map((t) => (
            <option key={t.id} value={t.id}>
              {label(t)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Compare with</span>
        <select value={compareTranslation ?? ''} onChange={(e) => onChange(translation, e.target.value || null)}>
          <option value="">None</option>
          {data.translations
            .filter((t) => t.id !== translation)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {label(t)}
              </option>
            ))}
        </select>
      </label>
    </div>
  )
}

function KindLegend() {
  return (
    <section>
      <h3>Curated link types</h3>
      <ul className="legend">
        {Object.entries(KIND_COLORS).map(([kind, color]) => (
          <li key={kind}>
            <span className="swatch" style={{ background: color }} />
            {kind}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Credits() {
  return (
    <p className="credits">
      Cross-references from <a href="https://www.openbible.info/labs/cross-references/">OpenBible.info</a> (CC-BY).
      Curated allusions are an editorial starter set. Bible texts are public-domain translations (see the README for
      sources). Inspired by Chris Harrison and Christoph Römhild’s arc diagram.
    </p>
  )
}
