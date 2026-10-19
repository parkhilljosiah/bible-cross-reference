import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import ArcCanvas from './ArcCanvas'
import BookChips from './BookChips'
import Controls from './Controls'
import Sidebar from './Sidebar'
import { loadData, type Data } from './data'
import { DEFAULT_TRANSLATION, readState, writeState } from './urlState'
import { buildContext, DEFAULT_FILTERS, type Filters, type Selection } from './graph'
import { MOBILE_QUERY, useMediaQuery } from './useMediaQuery'
import './App.css'

export default function App() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [pinned, setPinned] = useState<Selection | null>(null)
  const [translation, setTranslation] = useState(DEFAULT_TRANSLATION)
  const [compare, setCompare] = useState<string | null>(null)
  const mobile = useMediaQuery(MOBILE_QUERY)

  useEffect(() => {
    loadData().then(
      (d) => {
        setData(d)
        // A shared link carries the filters and selection in its query string.
        const shared = readState(d, window.location.search)
        if (shared) {
          setFilters(shared.filters)
          setPinned(shared.pinned)
          setTranslation(shared.translation)
          setCompare(shared.compare)
        } else {
          // No translation in the link: use the one this reader chose last time.
          try {
            const saved = window.localStorage.getItem('translation')
            if (saved && d.translations.some((t) => t.id === saved)) setTranslation(saved)
          } catch {
            /* storage unavailable (private mode): keep the default */
          }
        }
      },
      (e) => setError(String(e)),
    )
  }, [])

  // Keep the address bar in sync so the current view can always be copied or shared.
  useEffect(() => {
    if (!data) return
    const { pathname, hash } = window.location
    const state = { filters, pinned, translation, compare }
    window.history.replaceState(null, '', `${pathname}${writeState(data, state)}${hash}`)
  }, [data, filters, pinned, translation, compare])

  // Keeps the slider responsive while a 300k-link redraw catches up.
  const deferred = useDeferredValue(filters)
  const ctx = useMemo(() => (data ? buildContext(data, deferred) : null), [data, deferred])

  if (error) return <p className="status">Couldn’t load data: {error}</p>
  if (!data || !ctx) return <p className="status">Loading cross-references…</p>

  return (
    <div className="app">
      <Controls data={data} filters={filters} onChange={setFilters} shown={ctx.links.length} />
      <main>
        {mobile && <BookChips data={data} ctx={ctx} pinned={pinned} onPin={setPinned} />}
        <ArcCanvas data={data} ctx={ctx} pinned={pinned} onPin={setPinned} />
        <Sidebar
          key={pinned ? `${pinned.lo}-${pinned.hi}` : 'none'}
          data={data}
          ctx={ctx}
          pinned={pinned}
          onClear={() => setPinned(null)}
          onPin={setPinned}
          translation={translation}
          compareTranslation={compare}
          onTranslations={(primary, second) => {
            setTranslation(primary)
            setCompare(second)
            try {
              window.localStorage.setItem('translation', primary)
            } catch {
              /* storage unavailable: the choice just won't be remembered */
            }
          }}
          onCompare={(books, other) => {
            setFilters((f) => ({ ...f, between: books, and: [other], zoom: true }))
          }}
        />
      </main>
    </div>
  )
}
