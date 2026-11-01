import { useEffect, useMemo, useState } from 'react'
import { loadAllText, type Data } from './data'
import { buildIndex, parseQuery, search, type Query, type SearchMode } from './textSearch'

// Normalised text per translation, built once: normalising 31,000 verses takes about a tenth of a second.
const indexes = new Map<string, string[]>()
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
  const [loaded, setLoaded] = useState<{ tid: string; text: string[]; index: string[] } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ tid: string; done: number }>({ tid: '', done: 0 })
  const wanted = text !== null && data !== null
  const have = loaded?.tid === translation

  useEffect(() => {
    if (!wanted || have || !data) return
    let live = true
    loadAllText(data, translation, (done) => live && setProgress({ tid: translation, done })).then(
      (all) => {
        if (!live) return
        let index = indexes.get(translation)
        if (!index) {
          index = buildIndex(all)
          indexes.set(translation, index)
        }
        setLoaded({ tid: translation, text: all, index })
        setFailed(null)
      },
      () => live && setFailed(translation),
    )
    return () => {
      live = false
    }
  }, [wanted, have, translation, data])

  const query = useMemo(() => (text === null ? null : parseQuery(text)), [text])
  const hits = useMemo(
    () => (have && query && loaded ? search(loaded.index, query, mode) : NO_HITS),
    [have, query, loaded, mode],
  )

  return {
    status: !wanted ? 'idle' : failed === translation ? 'error' : have ? 'ready' : 'loading',
    progress: progress.tid === translation ? progress.done : 0,
    query,
    hits,
    text: have && loaded ? loaded.text : null,
  }
}
