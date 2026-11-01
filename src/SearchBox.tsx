import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Data } from './data'
import type { Selection } from './graph'
import { completeReference, parseReference } from './reference'

interface Props {
  data: Data
  /** A valid reference was entered: select it. */
  onSearch: (sel: Selection) => void
}

interface Option {
  label: string
  /** Spans the whole row of the grid (the "whole chapter" choice). */
  wide?: boolean
  choose: () => void
}

/** Columns of the number grid. Must match `.search-options.grid` in App.css; arrow keys move by this much. */
const COLS = 6

/**
 * "Search a verse" box. Type John 3:16, Ps 23 or Rev and press Enter, or let it guide you: it suggests books as you type,
 * then a grid of the book's chapters, then a grid of the chapter's verses. A chapter or verse that does not exist (say
 * "Philippians 5") is called out in the dropdown, with the real ones offered instead.
 */
export default function SearchBox({ data, onSearch }: Props) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(-1)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const completion = useMemo(
    () => (focused ? completeReference(text, data.books) : ({ stage: 'none' } as const)),
    [focused, text, data.books],
  )

  const submit = (value: string) => {
    const r = parseReference(value, data.books)
    if (!r.ok) {
      setText(value)
      setError(r.error)
      return
    }
    setError(null)
    setText(r.label) // show how it was understood
    setActive(-1)
    onSearch({ lo: r.lo, hi: r.hi })
    inputRef.current?.blur() // dismisses the phone keyboard so the result is visible
  }

  /** What the dropdown currently offers, and what choosing each entry does. */
  const options: Option[] = useMemo(() => {
    const fill = (next: string) => {
      setText(next)
      setError(null)
      setActive(-1)
      inputRef.current?.focus()
    }
    if (completion.stage === 'book') {
      return completion.books.map((b) => ({ label: b.name, choose: () => fill(`${b.name} `) }))
    }
    if (completion.stage === 'chapter') {
      const { book } = completion
      return completion.chapters.map((c) => ({ label: String(c), choose: () => fill(`${book.name} ${c}:`) }))
    }
    if (completion.stage === 'verse') {
      const { book, chapter } = completion
      const single = book.chapters.length === 1
      const whole: Option = {
        label: single ? 'Whole book' : 'Whole chapter',
        wide: true,
        choose: () => submit(single ? book.name : `${book.name} ${chapter}`),
      }
      const verses = completion.verses.map((v) => ({
        label: String(v),
        choose: () => submit(single ? `${book.name} ${v}` : `${book.name} ${chapter}:${v}`),
      }))
      return [whole, ...verses]
    }
    return []
    // submit only closes over stable setters and `data`, so it is safe to leave out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completion, data.books])

  const grid = completion.stage === 'chapter' || completion.stage === 'verse'
  const heading =
    completion.stage === 'chapter'
      ? `${completion.book.name}: choose a chapter`
      : completion.stage === 'verse'
        ? `${completion.book.name}${completion.book.chapters.length > 1 ? ` ${completion.chapter}` : ''}: choose a verse`
        : null
  // A failed search explains itself in the dropdown; so does a number that cannot exist.
  const hint = error ?? (completion.stage === 'chapter' || completion.stage === 'verse' ? completion.hint : null)
  const open = focused && (options.length > 0 || !!error)

  // "/" jumps to the search box from anywhere on the page, as on many sites.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      if (el.closest('input, textarea, select, [contenteditable]')) return
      e.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Keep the keyboard-highlighted entry in view when the list scrolls (Psalms has 150 chapters).
  useEffect(() => {
    if (active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, listId])

  const move = (delta: number) =>
    setActive((a) => {
      const n = options.length
      if (!n) return -1
      // The "whole chapter" entry fills the first row on its own, so down from it lands on verse 1, and up from the first row returns to it.
      if (grid && options[0]?.wide) {
        if (a === 0 && delta === COLS) return 1
        if (a >= 1 && a <= COLS && delta === -COLS) return 0
      }
      const next = a < 0 ? (delta > 0 ? 0 : n - 1) : a + delta
      return Math.max(0, Math.min(n - 1, next))
    })

  return (
    <form
      className="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        submit(text)
      }}
    >
      <div className="search-field">
        <label className="sr-only" htmlFor={`${listId}-input`}>
          Search for a verse
        </label>
        <input
          ref={inputRef}
          id={`${listId}-input`}
          type="text"
          value={text}
          placeholder="Search a verse, e.g. John 3:16"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
            setActive(-1)
          }}
          onFocus={(e) => {
            setFocused(true)
            e.currentTarget.select()
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            const navigating = active >= 0
            if (e.key === 'ArrowDown' && options.length) {
              e.preventDefault()
              move(grid ? COLS : 1)
            } else if (e.key === 'ArrowUp' && options.length) {
              e.preventDefault()
              move(grid ? -COLS : -1)
            } else if (e.key === 'ArrowRight' && grid && navigating) {
              e.preventDefault() // only once you are moving through the list; otherwise it is the text cursor
              move(1)
            } else if (e.key === 'ArrowLeft' && grid && navigating) {
              e.preventDefault()
              move(-1)
            } else if (e.key === 'Enter' && open && navigating) {
              e.preventDefault() // choose the highlighted entry instead of submitting the text
              options[active]?.choose()
            } else if (e.key === 'Escape') {
              setFocused(false)
              e.currentTarget.blur()
            }
          }}
        />

        {(open || hint) && focused && (
          // mousedown is cancelled on the whole popup so the input keeps focus (blur would close it before a tap lands)
          <div className="search-popup" onMouseDown={(e) => e.preventDefault()}>
            {hint ? (
              <p className={error ? 'search-hint error' : 'search-hint'} role={error ? 'alert' : undefined} aria-live={error ? undefined : 'polite'}>
                {hint}
              </p>
            ) : (
              heading && <p className="search-hint">{heading}</p>
            )}
            <ul id={listId} role="listbox" className={grid ? 'search-options grid' : 'search-options'}>
              {options.map((o, i) => (
                <li
                  key={`${o.label}-${i}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={[i === active ? 'active' : '', o.wide ? 'wide' : ''].filter(Boolean).join(' ') || undefined}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    o.choose()
                  }}
                >
                  {o.label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <button type="submit" className="search-go" aria-label="Search">
        Go
      </button>
    </form>
  )
}
