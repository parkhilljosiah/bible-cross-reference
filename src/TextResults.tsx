import { useMemo, useState } from 'react'
import { verseLabel, type Data } from './data'
import { TranslationBar } from './Sidebar'
import { countByBook, highlight, type SearchMode } from './textSearch'
import type { TextSearch } from './useTextSearch'

interface Props {
  data: Data
  /** What was typed, as shown back to the reader. */
  queryText: string
  mode: SearchMode
  onMode: (mode: SearchMode) => void
  search: TextSearch
  translation: string
  compareTranslation: string | null
  onTranslations: (primary: string, compare: string | null) => void
  /** A result was chosen: select that verse. */
  onPick: (verse: number) => void
  onClose: () => void
}

const PAGE = 40

/** The matching verses for a word or phrase, with the match highlighted. Remounted (via key) when the search changes. */
export default function TextResults({
  data,
  queryText,
  mode,
  onMode,
  search,
  translation,
  compareTranslation,
  onTranslations,
  onPick,
  onClose,
}: Props) {
  const [shown, setShown] = useState(PAGE)
  const name = data.translations.find((t) => t.id === translation)?.name ?? translation
  const { status, hits, query, text } = search

  const where = useMemo(() => {
    const counts = countByBook(hits, data.books.map((b) => b.start))
    return counts
      .map((n, i) => [i, n] as const)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [hits, data.books])

  const multiWord = query ? query.words.length > 1 : false

  return (
    <div className="text-results">
      <div className="side-head">
        <h2>“{queryText}”</h2>
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </div>

      {multiWord && (
        <div className="mode-toggle" role="group" aria-label="How to match several words">
          <button aria-pressed={mode === 'phrase'} onClick={() => onMode('phrase')}>
            Exact phrase
          </button>
          <button aria-pressed={mode === 'words'} onClick={() => onMode('words')}>
            All the words
          </button>
        </div>
      )}

      <TranslationBar
        data={data}
        translation={translation}
        compareTranslation={compareTranslation}
        onChange={onTranslations}
        hideCompare
      />

      {!query && status !== 'idle' && <p className="muted">Type at least two letters to search the text.</p>}
      {query && status === 'loading' && (
        <div role="status">
          <p className="muted">Loading the text of {name} to search it…</p>
          <div className="load-bar" aria-hidden="true">
            <span style={{ width: `${Math.round(search.progress * 100)}%` }} />
          </div>
        </div>
      )}
      {status === 'error' && <p className="muted">Couldn’t load the text. Check your connection and try again.</p>}

      {query && status === 'ready' && (
        <>
          <p className="muted" role="status">
            {hits.length === 0
              ? `No verse in the ${name} contains ${mode === 'phrase' && multiWord ? 'that exact phrase' : 'that'}.`
              : `${hits.length.toLocaleString()} ${hits.length === 1 ? 'verse' : 'verses'} in the ${name}.`}
            {hits.length === 0 && mode === 'phrase' && multiWord && ' Try “All the words”.'}
          </p>
          {where.length > 1 && (
            <p className="where">{where.map(([i, n]) => `${data.books[i].name} ${n.toLocaleString()}`).join(' · ')}</p>
          )}
          <ul className="results">
            {Array.from(hits.subarray(0, shown), (v) => (
              <li key={v}>
                <button className="result" onClick={() => onPick(v)}>
                  <span className="ref">{verseLabel(data, v, true)}</span>
                  <span className="snippet">
                    {text &&
                      highlight(text[v], query, mode).map((s, i) =>
                        s.hit ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>,
                      )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {hits.length > shown && (
            <button className="ghost" onClick={() => setShown(shown + PAGE)}>
              Show more ({(hits.length - shown).toLocaleString()} left)
            </button>
          )}
        </>
      )}
    </div>
  )
}
