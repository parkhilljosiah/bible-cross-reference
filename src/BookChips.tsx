import { useEffect, useRef } from 'react'
import { GENRE_COLORS, type Data } from './data'
import type { FilterContext, Selection } from './graph'

interface Props {
  data: Data
  ctx: FilterContext
  pinned: Selection | null
  onPin: (sel: Selection | null) => void
}

/** Touch-friendly alternative to the thin book strip: a scrolling row of tappable books. */
export default function BookChips({ data, ctx, pinned, onPin }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [pinned])

  return (
    <div className="book-chips" role="group" aria-label="Books">
      {data.books.map((b, i) => {
        if (!ctx.shown[i]) return null
        const active = pinned?.lo === b.start && pinned.hi === b.start + b.count - 1
        return (
          <button
            key={b.abbr}
            ref={active ? activeRef : undefined}
            className="book-chip"
            aria-pressed={active}
            style={{ borderColor: GENRE_COLORS[b.genre] }}
            onClick={() => onPin(active ? null : { lo: b.start, hi: b.start + b.count - 1 })}
          >
            {b.name}
          </button>
        )
      })}
    </div>
  )
}
