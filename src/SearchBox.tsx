import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Data } from './data'
import type { Selection } from './graph'
import { parseReference, suggestBooks } from './reference'

interface Props {
  data: Data
  /** A valid reference was entered: select it. */
  onSearch: (sel: Selection) => void
}

/** "Search a verse" box: type John 3:16, Ps 23 or Rev, press Enter. Book names are suggested as you type. */
export default function SearchBox({ data, onSearch }: Props) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(-1)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const suggestions = useMemo(() => (focused ? suggestBooks(text, data.books) : []), [focused, text, data.books])
  const open = suggestions.length > 0

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

  const accept = (i: number) => {
    // Fill in the book and carry on typing the chapter and verse.
    setText(`${suggestions[i].name} `)
    setActive(-1)
    setError(null)
    inputRef.current?.focus()
  }

  const submit = () => {
    const r = parseReference(text, data.books)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setError(null)
    setText(r.label) // show how it was understood
    setActive(-1)
    onSearch({ lo: r.lo, hi: r.hi })
    inputRef.current?.blur() // dismisses the phone keyboard so the result is visible
  }

  return (
    <form
      className="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
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
        aria-describedby={error ? `${listId}-error` : undefined}
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
          if (e.key === 'ArrowDown' && open) {
            e.preventDefault()
            setActive((a) => (a + 1) % suggestions.length)
          } else if (e.key === 'ArrowUp' && open) {
            e.preventDefault()
            setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1))
          } else if (e.key === 'Enter' && open && active >= 0) {
            e.preventDefault() // choose the highlighted book instead of submitting
            accept(active)
          } else if (e.key === 'Escape') {
            setFocused(false)
            e.currentTarget.blur()
          }
        }}
      />
      <button type="submit" className="search-go" aria-label="Search">
        Go
      </button>
      {open && (
        <ul id={listId} role="listbox" className="search-suggestions">
          {suggestions.map((b, i) => (
            <li
              key={b.abbr}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              // mousedown, not click: the input must keep focus or the list would close before the click lands
              onMouseDown={(e) => {
                e.preventDefault()
                accept(i)
              }}
            >
              {b.name}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id={`${listId}-error`} role="alert" className="search-error">
          {error}
        </p>
      )}
    </form>
  )
}
