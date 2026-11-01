import { useEffect, useMemo, useState } from 'react'
import { forgetTranslation, loadAllText, type Data } from './data'
import { Lru } from './lruCache'
import { buildIndex, parseQuery, search, type Query, type SearchMode } from './textSearch'

interface Loaded {
  /** Every verse of the translation, by global index. */
  text: string[]
  /** The same verses normalised for matching. Building it takes ~45 ms, so it is built once per load. */
  index: string[]
}

/**
 * Translations ready to search. Each holds about 12-13 MB (text plus index), so only the two most recently used are kept:
 * flipping between two translations is instant, and a third frees the oldest, text and index both.
 */
const ready = new Lru<Loaded>(2, (tid) => forgetTranslation(tid))
const NO_HITS = new Uint32Array(0)

export interface TextSearch {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** 0..1 while the translation's text is downloading. */
  progress: number
  /** The parsed query, or null when there is none or it is too short to search. */
  query: Query | null
  /** Verse indices that match, ascending. */
  hits: Uint32Array
  /** Every verse of the translation, for showing matches. */
  text: string[] | null
}

/**
 * Searches the text of one translation. The first search in a translation downloads it (all 66 books, in parallel); after that
 * a search is just a scan of the cached text. Changing the translation, the query or the mode searches again.
 */
export function useTextSearch(data: Data | null, translation: string, text: string | null, mode: SearchMode): TextSearch {
  // Bumped when a download finishes, so the render below picks the new entry out of `ready`.
  const [, setLoadedCount] = useState(0)
  const [failed, setFailed] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ tid: string; done: number }>({ tid: '', done: 0 })
  const wanted = text !== null && data !== null
  // Read straight from the cache, so a translation that is already loaded is ready in this very render (no "Loading" flash).
  const loaded = wanted ? ready.get(translation) : undefined
  const have = loaded !== undefined

  useEffect(() => {
    if (!wanted || have || !data) return
    let live = true
    loadAllText(data, translation, (done) => live && setProgress({ tid: translation, done })).then(
      (all) => {
        if (!live) return
        ready.set(translation, { text: all, index: buildIndex(all) })
        setFailed(null)
        setLoadedCount((n) => n + 1)
      },
      () => live && setFailed(translation),
    )
    return () => {
      live = false
    }
  }, [wanted, have, translation, data])

  const query = useMemo(() => (text === null ? null : parseQuery(text)), [text])
  const hits = useMemo(() => (loaded && query ? search(loaded.index, query, mode) : NO_HITS), [loaded, query, mode])

  return {
    status: !wanted ? 'idle' : failed === translation ? 'error' : have ? 'ready' : 'loading',
    progress: progress.tid === translation ? progress.done : 0,
    query,
    hits,
    text: loaded ? loaded.text : null,
  }
}
