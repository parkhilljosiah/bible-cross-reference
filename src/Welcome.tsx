import { useEffect, useRef } from 'react'

/** What each "Try it" button does. App supplies these; the window closes itself first. */
export interface WelcomeActions {
  openBook: (name: string) => void
  openVerse: (reference: string) => void
  searchText: (text: string) => void
  compareBooks: (a: string, b: string) => void
}

interface Props extends WelcomeActions {
  onClose: () => void
}

/**
 * The how-to window: a native modal dialog (Esc closes it, focus stays inside, screen readers announce it). Shown to
 * first-time visitors and reopened from the ? button or the ? key.
 */
export default function Welcome({ onClose, openBook, openVerse, searchText, compareBooks }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) {
      d.showModal()
      d.querySelector<HTMLElement>('.welcome-start')?.focus({ preventScroll: true })
    }
  }, [])

  /** Close, then do the thing the step describes. */
  const go = (action: () => void) => () => {
    onClose()
    action()
  }

  return (
    <dialog
      ref={ref}
      className="welcome"
      aria-labelledby="welcome-title"
      onClose={onClose}
      // A click on the dimmed area outside the card is a click on the dialog element itself.
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="welcome-card">
        <h2 id="welcome-title">Welcome to Scripture Echoes</h2>
        <p className="welcome-lead">
          See how the Bible refers to itself. Every arc joins two passages that point to each other, so you can watch, say,
          Revelation echo Daniel and Ezekiel.
        </p>

        <svg className="welcome-figure" viewBox="0 0 320 96" role="img" aria-label="Arcs joining passages along a line of books, from Genesis on the left to Revelation on the right">
          <path d="M20 70 A 60 60 0 0 1 140 70" />
          <path d="M60 70 A 100 70 0 0 1 260 70" />
          <path d="M180 70 A 60 55 0 0 1 300 70" />
          <line x1="20" y1="70" x2="300" y2="70" />
          <text x="20" y="88">Genesis</text>
          <text x="300" y="88" textAnchor="end">Revelation</text>
        </svg>
        <p className="welcome-note">
          Books run left to right along the strip. An arc joins a passage in one book to a passage in another; brighter areas have
          more connections.
        </p>

        <ol className="welcome-steps">
          <li>
            <div>
              <strong>Explore a book.</strong> Click a book on the strip, or slide your finger along it and lift to choose. Its
              connections light up and the strongest ones are listed.
            </div>
            <button type="button" onClick={go(() => openBook('Revelation'))}>
              Try Revelation
            </button>
          </li>
          <li>
            <div>
              <strong>Look up a verse.</strong> Type a reference in the search box, such as John 3:16 or Psalm 23. It suggests books,
              chapters and verses as you type.
            </div>
            <button type="button" onClick={go(() => openVerse('John 3:16'))}>
              Try John 3:16
            </button>
          </li>
          <li>
            <div>
              <strong>Search the words.</strong> Type a word or phrase instead and every verse containing it is listed and marked
              on the strip.
            </div>
            <button type="button" onClick={go(() => searchText('son of man'))}>
              Try “son of man”
            </button>
          </li>
          <li>
            <div>
              <strong>Compare two books.</strong> Pick books in Filters (the Between and And boxes) to see only the links
              joining them.
            </div>
            <button type="button" onClick={go(() => compareBooks('Revelation', 'Daniel'))}>
              Try Revelation and Daniel
            </button>
          </li>
        </ol>

        <p className="welcome-note">
          Tap a linked passage to read both texts, in seven translations. Pinch or scroll to zoom, and use Share link to send
          someone exactly what you are looking at.
        </p>

        <div className="welcome-footer">
          <span className="muted">Reopen this any time with the ? button{' '}(or press ?).</span>
          <button type="button" className="welcome-start" onClick={onClose}>
            Start exploring
          </button>
        </div>
      </div>
    </dialog>
  )
}
