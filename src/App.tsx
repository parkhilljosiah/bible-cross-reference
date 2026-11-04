import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import ArcCanvas from './ArcCanvas'
import BookChips from './BookChips'
import Controls from './Controls'
import Sidebar from './Sidebar'
import TextResults from './TextResults'
import Welcome from './Welcome'
import { loadData, type Data } from './data'
import { DEFAULT_TRANSLATION, readState, writeState } from './urlState'
import { buildContext, DEFAULT_FILTERS, type Filters, type Selection } from './graph'
import type { SearchMode } from './textSearch'
import { MOBILE_QUERY, useMediaQuery } from './useMediaQuery'
import { useTextSearch } from './useTextSearch'
import { shouldShowWelcome } from './welcomeRule'
import { parseReference } from './reference'
import './App.css'

export default function App() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [pinned, setPinned] = useState<Selection | null>(null)
  // Phone bottom sheet: expanded, it covers the whole diagram.
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const [translation, setTranslation] = useState(DEFAULT_TRANSLATION)
  const [compare, setCompare] = useState<string | null>(null)
  // A word or phrase being searched for in the text, and how several words are matched.
  const [query, setQuery] = useState<string | null>(null)
  const [queryMode, setQueryMode] = useState<SearchMode>('phrase')
  // First-time visitors on the plain site get the how-to window once; shared links go straight to their content.
  const [welcome, setWelcome] = useState(() => {
    try {
      return shouldShowWelcome(window.location.search, window.localStorage.getItem('welcomeSeen') === '1')
    } catch {
      return shouldShowWelcome(window.location.search, false) // storage unavailable: treat as a new visitor
    }
  })
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
          setQuery(shared.query)
          setQueryMode(shared.queryMode)
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

  // Remember that the window has been shown, so it greets each browser only once.
  useEffect(() => {
    if (!welcome) return
    try {
      window.localStorage.setItem('welcomeSeen', '1')
    } catch {
      /* it may show again next visit */
    }
  }, [welcome])

  // "?" opens the how-to window from anywhere outside a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      e.preventDefault()
      setWelcome(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Keep the address bar in sync so the current view can always be copied or shared.
  useEffect(() => {
    if (!data) return
    const { pathname, hash } = window.location
    const state = { filters, pinned, translation, compare, query, queryMode }
    window.history.replaceState(null, '', `${pathname}${writeState(data, state)}${hash}`)
  }, [data, filters, pinned, translation, compare, query, queryMode])

  // Keeps the slider responsive while a 300k-link redraw catches up.
  const deferred = useDeferredValue(filters)
  const ctx = useMemo(() => (data ? buildContext(data, deferred) : null), [data, deferred])

  // Word search runs over the chosen translation's text; it downloads that text the first time.
  const textSearch = useTextSearch(data, translation, query, queryMode)

  /** Select (or clear) a book or verse range. Clearing also collapses the sheet, so the next selection starts small. */
  const pin = (sel: Selection | null) => {
    setPinned(sel)
    if (!sel) setSheetExpanded(false)
  }

  if (error) return <p className="status">Couldn’t load data: {error}</p>
  if (!data || !ctx) return <p className="status">Loading cross-references…</p>

  /** A searched verse, chapter or book. It is a question about the whole Bible, so lift a book filter that would hide it. */
  const search = (sel: Selection) => {
    if (!ctx.shown[data.bookOf[sel.lo]] || !ctx.shown[data.bookOf[sel.hi]]) {
      setFilters((f) => ({ ...f, between: [], and: [], zoom: false }))
    }
    pin(sel)
  }

  /** Look for a word or phrase in the text. Shows the matches where the selection panel normally is. */
  const startTextSearch = (text: string) => {
    setQuery(text)
    setQueryMode('phrase')
    pin(null)
  }

  const onTranslations = (primary: string, second: string | null) => {
    setTranslation(primary)
    setCompare(second)
    try {
      window.localStorage.setItem('translation', primary)
    } catch {
      /* storage unavailable: the choice just won't be remembered */
    }
  }

  const bookIndex = (name: string) => data.books.findIndex((b) => b.name === name)
  const welcomeActions = {
    openBook: (name: string) => {
      const b = data.books[bookIndex(name)]
      if (b) search({ lo: b.start, hi: b.start + b.count - 1 })
    },
    openVerse: (reference: string) => {
      const r = parseReference(reference, data.books)
      if (r.ok) search({ lo: r.lo, hi: r.hi })
    },
    searchText: startTextSearch,
    compareBooks: (a: string, b: string) => {
      const i = bookIndex(a)
      const j = bookIndex(b)
      if (i < 0 || j < 0) return
      pin(null)
      setFilters((f) => ({ ...f, between: [i], and: [j], zoom: true }))
    },
  }

  return (
    <div className="app">
      <Controls
        data={data}
        filters={filters}
        onChange={setFilters}
        shown={ctx.links.length}
        onSearch={search}
        onTextSearch={startTextSearch}
        onHelp={() => setWelcome(true)}
      />
      <main>
        {mobile && <BookChips data={data} ctx={ctx} pinned={pinned} onPin={pin} />}
        <ArcCanvas
          data={data}
          ctx={ctx}
          pinned={pinned}
          onPin={pin}
          frozen={mobile && sheetExpanded && pinned !== null}
          hits={query !== null ? textSearch.hits : null}
        />
        <Sidebar
          key={pinned ? `${pinned.lo}-${pinned.hi}` : 'none'}
          data={data}
          ctx={ctx}
          pinned={pinned}
          onClear={() => pin(null)}
          onShowAll={() => setFilters({ ...DEFAULT_FILTERS, minVotes: 0 })}
          results={
            query !== null ? (
              <TextResults
                // A new search, mode or translation starts again from the first page of results.
                key={`${query}|${queryMode}|${translation}`}
                data={data}
                queryText={query}
                mode={queryMode}
                onMode={setQueryMode}
                search={textSearch}
                translation={translation}
                compareTranslation={compare}
                onTranslations={onTranslations}
                onPick={(v) => pin({ lo: v, hi: v })}
                onClose={() => setQuery(null)}
              />
            ) : null
          }
          onPin={pin}
          expanded={sheetExpanded && pinned !== null}
          onExpandedChange={setSheetExpanded}
          translation={translation}
          compareTranslation={compare}
          onTranslations={onTranslations}
          onCompare={(books, other) => {
            setFilters((f) => ({ ...f, between: books, and: [other], zoom: true }))
          }}
        />
      </main>
      {welcome && <Welcome onClose={() => setWelcome(false)} {...welcomeActions} />}
    </div>
  )
}
