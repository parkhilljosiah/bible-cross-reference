// Word and phrase search over verse text. Pure and dependency-free so it can be tested with `node --test`.
//
// Matching is by whole words and ignores case, accents and punctuation: "son of man" finds "the Son of man", and "man" does not
// match "woman" or "manna". An apostrophe splits a word, so "man's" is the words "man" and "s" (the same rule is applied to the
// query, so "man's" still finds "man's").

export type SearchMode = 'phrase' | 'words'

export interface Query {
  /** The normalised query: lower-case words separated by single spaces. */
  phrase: string
  /** The distinct words of the query. */
  words: string[]
}

/** Lower-cases, strips accents and turns every run of non-alphanumerics into one space. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
}

/** A query needs at least two letters or digits; returns null for anything shorter. */
export function parseQuery(text: string): Query | null {
  const phrase = normalize(text).trim()
  if (phrase.length < 2) return null
  return { phrase, words: [...new Set(phrase.split(' '))] }
}

/** Normalised copy of each verse, padded with spaces so a whole word or phrase is a plain substring test. */
export function buildIndex(verses: readonly string[]): string[] {
  return verses.map((v) => ` ${normalize(v).trim()} `)
}

/**
 * Indices of the verses that match. `phrase` needs the words together and in order; `words` needs each word somewhere in the
 * verse. For a single word the two modes agree.
 */
export function search(index: readonly string[], q: Query, mode: SearchMode): Uint32Array {
  const out: number[] = []
  const needle = ` ${q.phrase} `
  const words = q.words.map((w) => ` ${w} `)
  for (let i = 0; i < index.length; i++) {
    const v = index[i]
    if (mode === 'phrase' ? v.includes(needle) : words.every((w) => v.includes(w))) out.push(i)
  }
  return Uint32Array.from(out)
}

export interface Segment {
  text: string
  hit: boolean
}

// Words and the gaps between them, in the original text. Accented Latin letters stay inside words.
const TOKEN = /[A-Za-z0-9À-ɏḀ-ỿ]+|[^A-Za-z0-9À-ɏḀ-ỿ]+/g

/** Splits a verse into pieces, marking the ones the query matched (for highlighting). The pieces join back to the original. */
export function highlight(text: string, q: Query, mode: SearchMode): Segment[] {
  const tokens = text.match(TOKEN) ?? []
  const norm = tokens.map((t) => normalize(t).trim())
  const isWord = (i: number) => norm[i] !== '' && /[A-Za-z0-9À-ɏḀ-ỿ]/.test(tokens[i][0])
  const marked = new Array<boolean>(tokens.length).fill(false)

  if (mode === 'words' || q.words.length === 1) {
    const set = new Set(q.words)
    tokens.forEach((_, i) => {
      if (isWord(i) && set.has(norm[i])) marked[i] = true
    })
  } else {
    // Find the phrase as consecutive words (gaps between them are punctuation or spaces) and mark the gaps too, so it reads as one run.
    const target = q.phrase.split(' ')
    const wordAt: number[] = []
    tokens.forEach((_, i) => {
      if (isWord(i)) wordAt.push(i)
    })
    for (let w = 0; w + target.length <= wordAt.length; w++) {
      if (target.every((t, k) => norm[wordAt[w + k]] === t)) {
        for (let i = wordAt[w]; i <= wordAt[w + target.length - 1]; i++) marked[i] = true
        w += target.length - 1
      }
    }
  }

  const out: Segment[] = []
  tokens.forEach((t, i) => {
    const last = out[out.length - 1]
    if (last && last.hit === marked[i]) last.text += t
    else out.push({ text: t, hit: marked[i] })
  })
  return out
}

/** How many hits fall in each book, given the first verse index of every book (ascending). */
export function countByBook(hits: Uint32Array, bookStarts: readonly number[]): number[] {
  const counts = new Array<number>(bookStarts.length).fill(0)
  let b = 0
  for (const h of hits) {
    while (b + 1 < bookStarts.length && h >= bookStarts[b + 1]) b++
    counts[b]++
  }
  return counts
}
