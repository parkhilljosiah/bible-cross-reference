import { useEffect, useMemo, useRef, useState } from 'react'
import { GENRE_COLORS, KIND_COLORS, rangeLabel, type Data, type Genre } from './data'
import {
  IDENTITY_VIEW,
  MAX_ZOOM,
  linksTouching,
  makeLayout,
  type FilterContext,
  type Layout,
  type Selection,
  type View,
} from './graph'
import { hexToRgb, hslToRgb, type ArcSet, type RasterOptions, type RasterResult, type RGB } from './raster'
import { RasterClient } from './rasterClient'

// iOS Safari treats a swipe starting within ~20px of the left edge as "back" and slides the whole page
// away, which can't be cancelled from a web page. Keep the draggable strip clear of that zone on touch.
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
const PAD_X = COARSE ? 30 : 16
const PAD_TOP = 8
// Touch screens get a taller strip, a wider hit area for verse ranges and a fingertip-sized offset.
const BOOK_H = COARSE ? 30 : 18
const DENSITY_GAP = 4
const DENSITY_H = COARSE ? 40 : 52
const HIT_HALF = COARSE ? 7 : 1.5
const BOTTOM = BOOK_H + DENSITY_GAP + DENSITY_H + 10
const BUCKETS = 24
const ZOOM_GAP = 6
const BOOK_PALETTE: RGB[] = Array.from({ length: 66 }, (_, i) => hslToRgb((i * 137.5) % 360, 0.8, 0.62))
const GENRES = Object.keys(GENRE_COLORS) as Genre[]
const GENRE_PALETTE: RGB[] = GENRES.map((g) => hexToRgb(GENRE_COLORS[g]))
// Overview: color by how far an arc reaches (short = violet, long = gold), as in the original.
const SPAN_PALETTE: RGB[] = Array.from({ length: BUCKETS }, (_, k) =>
  hslToRgb(285 - 235 * ((k + 0.5) / BUCKETS), 0.85, 0.58),
)
// Curated links: quotation, allusion, echo.
const KIND_PALETTE: RGB[] = [KIND_COLORS.quotation, KIND_COLORS.allusion, KIND_COLORS.echo].map(hexToRgb)

interface Props {
  data: Data
  ctx: FilterContext
  pinned: Selection | null
  onPin: (sel: Selection | null) => void
}

const same = (a: Selection | null, b: Selection | null) => a?.lo === b?.lo && a?.hi === b?.hi

interface Geometry {
  w: number
  h: number
  baseY: number
  /** Vertical scale of the semicircles so the widest arc fits above the baseline. */
  scaleY: number
}

const clampView = (v: View, usable: number): View => {
  const k = Math.max(1, Math.min(MAX_ZOOM, v.k))
  return { k, off: Math.max(0, Math.min((k - 1) * usable, v.off)) }
}

function sizeCanvas(canvas: HTMLCanvasElement, g: Geometry) {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(g.w * dpr)
  canvas.height = Math.round(g.h * dpr)
  canvas.style.width = `${g.w}px`
  canvas.style.height = `${g.h}px`
  const c = canvas.getContext('2d')!
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.clearRect(0, 0, canvas.width, canvas.height)
  return { c, dpr }
}

/** Draws a rasterized arc image scaled onto the full-size canvas (dense images are rendered at 1x). */
function blit(c: CanvasRenderingContext2D, dpr: number, g: Geometry, res: RasterResult) {
  const off = document.createElement('canvas')
  off.width = res.width
  off.height = res.height
  off.getContext('2d')!.putImageData(new ImageData(res.data, res.width, res.height), 0, 0)
  c.imageSmoothingEnabled = true
  c.drawImage(off, 0, 0, Math.round(g.w * dpr), Math.round(g.h * dpr))
}

type JobOptions = Omit<RasterOptions, 'width' | 'height' | 'dpr' | 'baseY' | 'scaleY'>

/** Packs links into transferable arrays and the options the worker needs. */
function makeJob(
  g: Geometry,
  count: number,
  fill: (xa: Float32Array, xb: Float32Array, color: Uint8Array) => number,
  o: JobOptions,
): { set: ArcSet; opts: RasterOptions } {
  const xa = new Float32Array(count)
  const xb = new Float32Array(count)
  const color = new Uint8Array(count)
  const m = fill(xa, xb, color)
  const dpr = window.devicePixelRatio || 1
  // Dense images are blurry anyway, so render them at 1x and let the browser scale them up.
  const res = m > 20000 ? 1 : dpr
  return {
    set: { xa, xb, color, count: m },
    opts: { ...o, width: g.w, height: g.h, dpr: res, baseY: g.baseY, scaleY: g.scaleY },
  }
}

function paintBase(
  canvas: HTMLCanvasElement,
  d: Data,
  layout: Layout,
  g: Geometry,
  res: RasterResult,
  columns: Float32Array,
) {
  const { c, dpr } = sizeCanvas(canvas, g)
  blit(c, dpr, g, res)
  c.setTransform(dpr, 0, 0, dpr, 0, 0)

  // Book strip. Labels stick to the visible left edge of a book that is partly scrolled off.
  c.font = `${COARSE ? 12 : 10}px ui-sans-serif, system-ui, sans-serif`
  c.textBaseline = 'middle'
  d.books.forEach((book, i) => {
    if (!layout.shown[i]) return
    const x0 = layout.x0[i]
    const x1 = layout.x1[i]
    if (x1 < 0 || x0 > g.w) return
    c.fillStyle = GENRE_COLORS[book.genre]
    c.globalAlpha = 0.9
    c.fillRect(x0, g.baseY + 2, Math.max(0.5, x1 - x0 - 0.6), BOOK_H)
    c.globalAlpha = 1
    const vx0 = Math.max(x0, 0)
    if (Math.min(x1, g.w) - vx0 > c.measureText(book.abbr).width + 6) {
      c.fillStyle = '#0b0d12'
      c.fillText(book.abbr, vx0 + 3, g.baseY + 2 + BOOK_H / 2 + 0.5)
    }
  })

  // Link density under the baseline, like the bars in the original diagram.
  let max = 1
  for (const v of columns) max = Math.max(max, v)
  const top = g.baseY + 2 + BOOK_H + DENSITY_GAP
  c.fillStyle = 'rgba(190, 196, 210, 0.55)'
  for (let x = 0; x < columns.length; x++) {
    if (!columns[x]) continue
    c.fillRect(x, top, 1, Math.max(1, Math.sqrt(columns[x] / max) * DENSITY_H))
  }
}

function paintMarkers(
  canvas: HTMLCanvasElement,
  layout: Layout,
  g: Geometry,
  res: RasterResult | null,
  hover: Selection | null,
  pinned: Selection | null,
) {
  const { c, dpr } = sizeCanvas(canvas, g)
  if (res) blit(c, dpr, g, res)
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  const mark = (s: Selection, strong: boolean) => {
    const x0 = layout.verseX(s.lo) - layout.ppv / 2
    const x1 = layout.verseX(s.hi) + layout.ppv / 2
    c.strokeStyle = strong ? '#fff' : 'rgba(255,255,255,0.6)'
    c.lineWidth = strong ? 2 : 1.5
    c.strokeRect(x0, g.baseY + 1, Math.max(2, x1 - x0), BOOK_H + 2)
  }
  if (pinned) mark(pinned, true)
  if (hover && !same(hover, pinned)) mark(hover, false)
}

export default function ArcCanvas({ data, ctx, pinned, onPin }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const layersRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const baseClient = useRef<RasterClient | null>(null)
  const overlayClient = useRef<RasterClient | null>(null)

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<Selection | null>(null)
  const [pointer, setPointer] = useState({ x: 0, y: 0 })
  const [view, setView] = useState<View>(IDENTITY_VIEW)
  const [busy, setBusy] = useState(false)

  // The view the user is heading for (updates every gesture frame) vs. the one the canvas was painted at.
  const target = useRef<View>(IDENTITY_VIEW)
  const painted = useRef<View>(IDENTITY_VIEW)
  const commitTimer = useRef<number | null>(null)

  useEffect(() => {
    baseClient.current = new RasterClient()
    overlayClient.current = new RasterClient()
    return () => {
      baseClient.current?.dispose()
      overlayClient.current?.dispose()
    }
  }, [])

  useEffect(() => {
    const el = wrapRef.current!
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: Math.floor(width), h: Math.floor(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const usable = Math.max(1, size.w - PAD_X * 2)
  const zoomed = ctx.shown.some((s) => !s)
  const geo = useMemo<Geometry>(() => {
    const half = Math.max(1, usable / 2)
    const room = Math.max(40, size.h - BOTTOM - PAD_TOP)
    // Squash the semicircle on wide, short screens; never stretch it taller than round.
    const scaleY = Math.min(1, room / half)
    // On tall, narrow screens hug the top bar and leave any spare height at the bottom.
    return { w: size.w, h: size.h, baseY: PAD_TOP + scaleY * half, scaleY }
  }, [size, usable])
  const geoRef = useRef(geo)
  geoRef.current = geo
  const usableRef = useRef(usable)
  usableRef.current = usable

  const viewC = useMemo(() => clampView(view, usable), [view, usable])
  const gap = zoomed ? ZOOM_GAP : 0
  const layout = useMemo(
    () => makeLayout(data, ctx.shown, PAD_X, usable, gap, viewC),
    [data, ctx.shown, usable, gap, viewC],
  )
  const baseLayout = useMemo(
    () => makeLayout(data, ctx.shown, PAD_X, usable, gap, IDENTITY_VIEW),
    [data, ctx.shown, usable, gap],
  )

  // ---- zoom and pan -------------------------------------------------------------------------------

  /** Positions the existing bitmap so it approximates the target view until the re-render lands. */
  const applyTransform = () => {
    const el = layersRef.current
    if (!el) return
    const pv = painted.current
    const tv = target.current
    const s = tv.k / pv.k
    const tx = PAD_X * (1 - s) + s * pv.off - tv.off
    const ty = geoRef.current.baseY * (1 - s)
    el.style.transform = s === 1 && Math.abs(tx) < 0.01 ? '' : `translate(${tx}px, ${ty}px) scale(${s})`
  }

  const commit = () => {
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current)
    commitTimer.current = null
    setView({ ...target.current })
  }
  const commitSoon = () => {
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current)
    commitTimer.current = window.setTimeout(commit, 140)
  }

  const setTarget = (v: View) => {
    target.current = clampView(v, usableRef.current)
    applyTransform()
  }
  /** Zoom by `factor`, keeping the content under screen x `px` where it is. */
  const zoomAt = (px: number, factor: number) => {
    const { k, off } = target.current
    const nk = Math.max(1, Math.min(MAX_ZOOM, k * factor))
    const u = (px - PAD_X + off) / k
    setTarget({ k: nk, off: u * nk - (px - PAD_X) })
  }

  useEffect(() => {
    const el = wrapRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setTarget({ k: target.current.k, off: target.current.off + e.deltaX })
      } else {
        // Trackpad pinch arrives as ctrl+wheel with small deltas; mouse wheels need a gentler gain.
        zoomAt(e.clientX - rect.left, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)))
      }
      commitSoon()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A different set of books means a different baseline, so start from the full view again.
  const shownKey = ctx.shown.map((s) => (s ? 1 : 0)).join('')
  useEffect(() => {
    target.current = IDENTITY_VIEW
    setView(IDENTITY_VIEW)
  }, [shownKey])

  const fitSelection = () => {
    if (!pinned) return
    const x0 = baseLayout.verseX(pinned.lo) - baseLayout.ppv / 2
    const x1 = baseLayout.verseX(pinned.hi) + baseLayout.ppv / 2
    const k = Math.min(MAX_ZOOM, Math.max(1, usable / Math.max(1, x1 - x0)))
    setTarget({ k, off: (x0 - PAD_X) * k })
    commit()
  }

  // ---- rendering ----------------------------------------------------------------------------------

  // Base layer: all arcs that pass the filters, plus the book strip and density bars.
  useEffect(() => {
    if (size.w <= 0 || size.h <= 0) return
    const client = baseClient.current
    if (!client) return
    const { links, colorBy } = ctx
    const columns = new Float32Array(Math.ceil(size.w) + 1)
    const total = data.totalVerses
    const job = makeJob(
      geo,
      links.length,
      (xa, xb, color) => {
        let m = 0
        for (let i = 0; i < links.length; i++) {
          const e = links[i]
          const x0 = layout.verseX(data.a[e])
          const x1 = layout.verseX(data.b[e])
          if (x1 < 0 || x0 > geo.w) continue
          xa[m] = x0
          xb[m] = x1
          color[m] =
            colorBy === 'kind'
              ? data.kind[e] - 1
              : colorBy === 'book'
                ? data.bookOf[data.a[e]] % BOOK_PALETTE.length
                : Math.min(BUCKETS - 1, Math.floor(Math.sqrt((data.b[e] - data.a[e]) / total) * BUCKETS))
          if (x0 >= 0 && x0 <= geo.w) columns[Math.round(x0)]++
          if (x1 >= 0 && x1 <= geo.w) columns[Math.round(x1)]++
          m++
        }
        return m
      },
      {
        palette: colorBy === 'kind' ? KIND_PALETTE : colorBy === 'book' ? BOOK_PALETTE : SPAN_PALETTE,
        gain: 1.5,
        gamma: links.length > 20000 ? 1.05 : 0.65,
      },
    )
    let stale = false
    setBusy(true)
    client.render(job.set, job.opts).then((res) => {
      if (stale || !res) return
      paintBase(baseRef.current!, data, layout, geo, res, columns)
      painted.current = viewC
      applyTransform()
      setBusy(false)
    })
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ctx, layout, geo, size, viewC])

  // Overlay: arcs touching the hovered or pinned range, colored by what they connect to.
  useEffect(() => {
    if (size.w <= 0 || size.h <= 0) return
    const client = overlayClient.current
    const canvas = overlayRef.current
    if (!client || !canvas) return
    const sel = hover ?? pinned
    if (!sel) {
      sizeCanvas(canvas, geo)
      return
    }
    const ids = linksTouching(data, ctx, sel.lo, sel.hi)
    const job = makeJob(
      geo,
      ids.length,
      (xa, xb, color) => {
        let m = 0
        for (const e of ids) {
          const x0 = layout.verseX(data.a[e])
          const x1 = layout.verseX(data.b[e])
          if (x1 < 0 || x0 > geo.w) continue
          xa[m] = x0
          xb[m] = x1
          const other = data.a[e] >= sel.lo && data.a[e] <= sel.hi ? data.b[e] : data.a[e]
          color[m] = GENRES.indexOf(data.books[data.bookOf[other]].genre)
          m++
        }
        return m
      },
      { palette: GENRE_PALETTE, gain: ids.length > 3000 ? 1.3 : 2.2, gamma: 0.8, preserveHue: true },
    )
    let stale = false
    client.render(job.set, job.opts).then((res) => {
      if (stale || !res) return
      paintMarkers(canvas, layout, geo, res, hover, pinned)
    })
    return () => {
      stale = true
    }
  }, [data, ctx, layout, geo, size, hover, pinned])

  // ---- pointer input ------------------------------------------------------------------------------

  const locate = (clientX: number, clientY: number, rect: DOMRect): Selection | null => {
    const x = clientX - rect.left
    const y = clientY - rect.top
    if (y < geo.baseY - 2) return null
    if (y <= geo.baseY + 2 + BOOK_H + DENSITY_GAP / 2) {
      const bi = layout.bookAt(x)
      if (bi < 0) return null
      const b = data.books[bi]
      return { lo: b.start, hi: b.start + b.count - 1 }
    }
    return layout.rangeAt(x, HIT_HALF)
  }

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ mode: null as 'scrub' | 'pan' | 'pinch' | null, x0: 0, off0: 0, k0: 1, dist0: 1, mid0: 0, moved: false })
  const suppressClick = useRef(false)

  const track = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setPointer({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    const next = locate(e.clientX, e.clientY, rect)
    setHover((prev) => (same(prev, next) ? prev : next))
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    pointers.current.set(e.pointerId, { x, y })
    const g = gesture.current
    if (pointers.current.size >= 2) {
      const [p, q] = [...pointers.current.values()]
      Object.assign(g, {
        mode: 'pinch',
        dist0: Math.max(1, Math.hypot(p.x - q.x, p.y - q.y)),
        mid0: (p.x + q.x) / 2,
        k0: target.current.k,
        off0: target.current.off,
        moved: true,
      })
      setHover(null)
      return
    }
    if (y < geo.baseY - 2) {
      // Empty arc area: drag to pan when zoomed in.
      Object.assign(g, { mode: 'pan', x0: x, off0: target.current.off, moved: false })
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* pointer already gone; the drag simply won't follow outside the canvas */
      }
      setHover(null)
    } else {
      g.mode = 'scrub'
      track(e)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current
    const p = pointers.current.get(e.pointerId)
    if (!p) {
      track(e) // mouse hover, no button down
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    p.x = e.clientX - rect.left
    p.y = e.clientY - rect.top
    if (g.mode === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const k = Math.max(1, Math.min(MAX_ZOOM, g.k0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.dist0)))
      const mid = (a.x + b.x) / 2
      // Keep the content that was under the fingers' midpoint under it as it moves.
      const u = (g.mid0 - PAD_X + g.off0) / g.k0
      setTarget({ k, off: u * k - (mid - PAD_X) })
      commitSoon()
    } else if (g.mode === 'pan') {
      const dx = p.x - g.x0
      if (Math.abs(dx) > 4) g.moved = true
      if (g.moved) {
        setTarget({ k: target.current.k, off: g.off0 - dx })
        commitSoon()
      }
    } else if (g.mode === 'scrub') {
      track(e)
    }
  }

  const endPointer = (e: React.PointerEvent) => {
    const g = gesture.current
    pointers.current.delete(e.pointerId)
    if (g.mode === 'pinch') {
      // Lifting one finger ends the pinch; the click that follows must not pin anything.
      if (pointers.current.size < 2) {
        g.mode = null
        suppressClick.current = true
        commit()
      }
    } else if (g.mode === 'pan') {
      g.mode = null
      if (g.moved) {
        suppressClick.current = true
        commit()
      }
    } else {
      g.mode = null
    }
  }

  const hoverCount = useMemo(
    () => (hover ? linksTouching(data, ctx, hover.lo, hover.hi).length : 0),
    [hover, data, ctx],
  )

  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <div
      ref={wrapRef}
      className="arc-wrap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false
          return
        }
        const target = locate(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
        // On touch, a stray tap in empty space shouldn't discard the selection; the sheet has a Clear button.
        if (!target && COARSE) return
        onPin(target && !same(target, pinned) ? target : null)
      }}
    >
      <div ref={layersRef} className={hover || pinned ? 'layers has-selection' : 'layers'}>
        <canvas
          ref={baseRef}
          className="layer base"
          role="img"
          aria-label="Arc diagram of Bible cross-references. Select a book in the strip below the arcs to explore its links. Pinch or scroll to zoom."
        />
        <canvas
          ref={overlayRef}
          className="layer overlay"
          aria-hidden="true"
          style={{ cursor: hover ? 'pointer' : 'default' }}
        />
      </div>

      <div className="zoom-controls" onPointerDown={stop} onPointerUp={stop} onClick={stop}>
        <button aria-label="Zoom in" onClick={() => { zoomAt(PAD_X + usable / 2, 1.8); commit() }}>
          +
        </button>
        <button aria-label="Zoom out" onClick={() => { zoomAt(PAD_X + usable / 2, 1 / 1.8); commit() }}>
          −
        </button>
        {pinned && (
          <button aria-label="Zoom to selection" title="Zoom to selection" onClick={fitSelection}>
            ⤢
          </button>
        )}
        {view.k > 1.01 && (
          <button
            className="zoom-reset"
            aria-label="Reset zoom"
            onClick={() => {
              target.current = IDENTITY_VIEW
              applyTransform()
              commit()
            }}
          >
            {view.k.toFixed(view.k < 10 ? 1 : 0)}×
          </button>
        )}
      </div>

      <div className={busy ? 'busy on' : 'busy'} aria-hidden="true">
        Rendering…
      </div>

      {hover && (
        <div
          className="tooltip"
          style={{
            left: Math.max(8, Math.min(pointer.x + (COARSE ? -75 : 14), size.w - 170)),
            top: Math.max(8, pointer.y - (COARSE ? 90 : 46)),
          }}
        >
          <strong>{rangeLabel(data, hover.lo, hover.hi)}</strong>
          <span>{hoverCount.toLocaleString()} links</span>
        </div>
      )}
    </div>
  )
}
