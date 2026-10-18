import { useState } from 'react'
import type { Data } from './data'
import { DEFAULT_FILTERS, type Filters } from './graph'

interface Props {
  data: Data
  filters: Filters
  onChange: (f: Filters) => void
  shown: number
}

export default function Controls({ data, filters, onChange, shown }: Props) {
  // Only meaningful on small screens, where the filter fields collapse behind a button.
  const [open, setOpen] = useState(false)
  const active = filters.between.length > 0 || filters.and.length > 0
  const isDefault =
    !active &&
    !filters.zoom &&
    filters.minVotes === DEFAULT_FILTERS.minVotes &&
    filters.source === DEFAULT_FILTERS.source
  const curatedOnly = filters.source === 'curated'
  const [copied, setCopied] = useState(false)

  const share = async () => {
    const url = window.location.href
    try {
      // Phones get the native share sheet; desktops copy the link.
      if (typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: 'Scripture Echoes', url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      }
    } catch {
      /* dismissed share sheet or blocked clipboard: nothing to do */
    }
  }
  const chosen = filters.between.length + filters.and.length

  return (
    <header className="controls">
      <div className="title">
        <h1>Scripture Echoes</h1>
        <span className="muted count">
          {shown.toLocaleString()} of {data.linkCount.toLocaleString()} links
        </span>
        <button
          className="filters-toggle"
          aria-expanded={open}
          aria-controls="filter-fields"
          onClick={() => setOpen(!open)}
        >
          Filters{chosen > 0 ? ` (${chosen})` : ''}
        </button>
      </div>

      <div id="filter-fields" className={open ? 'filters open' : 'filters'}>
        <BookPicker
          label="Between"
          data={data}
          value={filters.between}
          onChange={(between) => onChange({ ...filters, between })}
        />
        <BookPicker label="And" data={data} value={filters.and} onChange={(and) => onChange({ ...filters, and })} />
        <label className="field">
          <span>Min votes: {filters.minVotes}</span>
          <input
            type="range"
            min={0}
            max={60}
            value={filters.minVotes}
            disabled={curatedOnly}
            onChange={(e) => onChange({ ...filters, minVotes: +e.target.value })}
          />
        </label>
        <label className="field check">
          <input
            type="checkbox"
            checked={curatedOnly}
            onChange={(e) => onChange({ ...filters, source: e.target.checked ? 'curated' : 'all' })}
          />
          <span>Curated allusions only ({data.curatedCount})</span>
        </label>
        <label className="field check">
          <input
            type="checkbox"
            checked={filters.zoom}
            disabled={!active}
            onChange={(e) => onChange({ ...filters, zoom: e.target.checked })}
          />
          <span>Zoom to chosen books</span>
        </label>
        <button className="reset-all" disabled={isDefault} onClick={() => onChange(DEFAULT_FILTERS)}>
          Reset all
        </button>
        <button className="reset-all" onClick={share} aria-live="polite">
          {copied ? 'Link copied' : 'Share link'}
        </button>
      </div>
    </header>
  )
}

interface PickerProps {
  label: string
  data: Data
  value: number[]
  onChange: (v: number[]) => void
}

function BookPicker({ label, data, value, onChange }: PickerProps) {
  return (
    <div className="field picker">
      <span>{label}</span>
      <div className="picker-row">
        {value.map((bi) => (
          <button
            key={bi}
            className="tag"
            aria-label={`Remove ${data.books[bi].name}`}
            onClick={() => onChange(value.filter((x) => x !== bi))}
          >
            {data.books[bi].abbr} ×
          </button>
        ))}
        <select
          aria-label={`Add book to “${label}”`}
          value=""
          onChange={(e) => {
            if (e.target.value !== '') onChange([...value, +e.target.value])
          }}
        >
          <option value="">{value.length ? '+ add' : 'Any book'}</option>
          {(['OT', 'NT'] as const).map((t) => (
            <optgroup key={t} label={t === 'OT' ? 'Old Testament' : 'New Testament'}>
              {data.books.map((b, i) =>
                b.testament === t && !value.includes(i) ? (
                  <option key={i} value={i}>
                    {b.name}
                  </option>
                ) : null,
              )}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  )
}
