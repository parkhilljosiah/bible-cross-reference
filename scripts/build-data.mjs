// Builds compact app data from data/raw into public/data.
//   books.json  – book metadata + per-chapter verse counts
//   refs.bin    – little-endian records of (from:u16, to:u16, votes:i16); u16 = global verse index
//   kjv.json    – verse text, indexed by global verse index
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

// [OpenBible abbreviation, display name, genre]
const BOOKS = [
  ['Gen', 'Genesis', 'Law'], ['Exod', 'Exodus', 'Law'], ['Lev', 'Leviticus', 'Law'],
  ['Num', 'Numbers', 'Law'], ['Deut', 'Deuteronomy', 'Law'],
  ['Josh', 'Joshua', 'History'], ['Judg', 'Judges', 'History'], ['Ruth', 'Ruth', 'History'],
  ['1Sam', '1 Samuel', 'History'], ['2Sam', '2 Samuel', 'History'],
  ['1Kgs', '1 Kings', 'History'], ['2Kgs', '2 Kings', 'History'],
  ['1Chr', '1 Chronicles', 'History'], ['2Chr', '2 Chronicles', 'History'],
  ['Ezra', 'Ezra', 'History'], ['Neh', 'Nehemiah', 'History'], ['Esth', 'Esther', 'History'],
  ['Job', 'Job', 'Wisdom'], ['Ps', 'Psalms', 'Wisdom'], ['Prov', 'Proverbs', 'Wisdom'],
  ['Eccl', 'Ecclesiastes', 'Wisdom'], ['Song', 'Song of Solomon', 'Wisdom'],
  ['Isa', 'Isaiah', 'Prophets'], ['Jer', 'Jeremiah', 'Prophets'], ['Lam', 'Lamentations', 'Prophets'],
  ['Ezek', 'Ezekiel', 'Prophets'], ['Dan', 'Daniel', 'Prophets'], ['Hos', 'Hosea', 'Prophets'],
  ['Joel', 'Joel', 'Prophets'], ['Amos', 'Amos', 'Prophets'], ['Obad', 'Obadiah', 'Prophets'],
  ['Jonah', 'Jonah', 'Prophets'], ['Mic', 'Micah', 'Prophets'], ['Nah', 'Nahum', 'Prophets'],
  ['Hab', 'Habakkuk', 'Prophets'], ['Zeph', 'Zephaniah', 'Prophets'], ['Hag', 'Haggai', 'Prophets'],
  ['Zech', 'Zechariah', 'Prophets'], ['Mal', 'Malachi', 'Prophets'],
  ['Matt', 'Matthew', 'Gospels'], ['Mark', 'Mark', 'Gospels'], ['Luke', 'Luke', 'Gospels'],
  ['John', 'John', 'Gospels'], ['Acts', 'Acts', 'History'],
  ['Rom', 'Romans', 'Epistles'], ['1Cor', '1 Corinthians', 'Epistles'], ['2Cor', '2 Corinthians', 'Epistles'],
  ['Gal', 'Galatians', 'Epistles'], ['Eph', 'Ephesians', 'Epistles'], ['Phil', 'Philippians', 'Epistles'],
  ['Col', 'Colossians', 'Epistles'], ['1Thess', '1 Thessalonians', 'Epistles'],
  ['2Thess', '2 Thessalonians', 'Epistles'], ['1Tim', '1 Timothy', 'Epistles'],
  ['2Tim', '2 Timothy', 'Epistles'], ['Titus', 'Titus', 'Epistles'], ['Phlm', 'Philemon', 'Epistles'],
  ['Heb', 'Hebrews', 'Epistles'], ['Jas', 'James', 'Epistles'], ['1Pet', '1 Peter', 'Epistles'],
  ['2Pet', '2 Peter', 'Epistles'], ['1John', '1 John', 'Epistles'], ['2John', '2 John', 'Epistles'],
  ['3John', '3 John', 'Epistles'], ['Jude', 'Jude', 'Epistles'], ['Rev', 'Revelation', 'Apocalyptic'],
]

const kjv = JSON.parse(readFileSync('data/raw/en_kjv.json', 'utf8').replace(/^﻿/, ''))
if (kjv.length !== BOOKS.length) throw new Error(`expected ${BOOKS.length} books, got ${kjv.length}`)

const books = []
const text = []
const abbrIndex = new Map()
let offset = 0
BOOKS.forEach(([abbr, name, genre], i) => {
  const chapters = kjv[i].chapters.map((c) => c.length)
  const count = chapters.reduce((a, b) => a + b, 0)
  books.push({ abbr, name, genre, testament: i < 39 ? 'OT' : 'NT', chapters, start: offset, count })
  abbrIndex.set(abbr, i)
  for (const ch of kjv[i].chapters) for (const v of ch) text.push(v.replace(/\{[^}]*\}/g, '').trim())
  offset += count
})

const verseIndex = (ref) => {
  const [abbr, ch, v] = ref.split('.')
  const bi = abbrIndex.get(abbr)
  if (bi === undefined) return -1
  const b = books[bi]
  if (+ch < 1 || +ch > b.chapters.length) return -1
  if (+v < 1 || +v > b.chapters[+ch - 1]) return -1
  let idx = b.start
  for (let c = 0; c < +ch - 1; c++) idx += b.chapters[c]
  return idx + +v - 1
}

const lines = readFileSync('data/raw/cross_references.txt', 'utf8').split('\n').slice(1)
// Links are treated as undirected and stored lo < hi (canonical order gives direction).
// A↔B and B↔A collapse into one record that keeps the higher vote count.
// kind: 0 = plain cross-reference, otherwise a curated type (see KINDS).
const KINDS = { quotation: 1, allusion: 2, echo: 3 }
const best = new Map()
let dropped = 0
let merged = 0
for (const line of lines) {
  if (!line.trim()) continue
  const [from, to, votes] = line.split('\t')
  // "To" may be a range (Prov.8.22-Prov.8.30); anchor on the first verse.
  const f = verseIndex(from)
  const t = verseIndex(to.split('-')[0])
  if (f < 0 || t < 0 || f === t) { dropped++; continue }
  const lo = Math.min(f, t)
  const hi = Math.max(f, t)
  const v = Math.max(-32768, Math.min(32767, +votes))
  const key = lo * 32768 + hi
  const prev = best.get(key)
  if (prev !== undefined) merged++
  if (prev === undefined || v > prev.v) best.set(key, { v, kind: 0 })
}

// Curated allusions: "later | earlier | type | note", refs as Book.c.v or Book.c.v-v or Book.c.v-Book.c.v.
const parseRange = (ref, where) => {
  const [first, second] = ref.trim().split(/-(?=[^-]*$)/)
  const lo = verseIndex(first)
  if (lo < 0) throw new Error(`${where}: unknown verse "${first}"`)
  if (!second) return [lo, lo]
  const full = second.includes('.') ? second : first.split('.').slice(0, 2).join('.') + '.' + second
  const hi = verseIndex(full)
  if (hi < lo) throw new Error(`${where}: bad range "${ref}"`)
  return [lo, hi]
}
const curated = []
readFileSync('data/curated/allusions.txt', 'utf8').split('\n').forEach((raw, i) => {
  const line = raw.trim()
  if (!line || line.startsWith('#')) return
  const [from, to, type, ...note] = line.split('|').map((x) => x.trim())
  const where = `allusions.txt:${i + 1}`
  if (!KINDS[type]) throw new Error(`${where}: unknown type "${type}"`)
  const A = parseRange(from, where)
  const B = parseRange(to, where)
  curated.push({ A, B, kind: KINDS[type], note: note.join('|') })
})

let marked = 0
let appended = 0
const curatedAt = new Map() // key -> curated entries for that pair
for (const c of curated) {
  const a = c.A[0]
  const b = c.B[0]
  if (a === b) throw new Error('curated link joins a verse to itself')
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const key = lo * 32768 + hi
  const rec = best.get(key)
  if (rec) {
    if (rec.kind === 0) marked++
    // Keep the strongest type if the pair is listed more than once (quotation < allusion < echo).
    rec.kind = rec.kind === 0 ? c.kind : Math.min(rec.kind, c.kind)
  } else {
    best.set(key, { v: 0, kind: c.kind })
    appended++
  }
  if (!curatedAt.has(key)) curatedAt.set(key, [])
  curatedAt.get(key).push({ ...c, lo, hi })
}

const recs = [...best].map(([key, r]) => [Math.floor(key / 32768), key % 32768, r.v, r.kind])
recs.sort((x, y) => x[0] - y[0] || x[1] - y[1])

// 8 bytes per link: a:u16, b:u16, votes:i16, kind:u8, pad:u8
const buf = Buffer.alloc(recs.length * 8)
const indexOfKey = new Map()
recs.forEach(([f, t, v, kind], i) => {
  buf.writeUInt16LE(f, i * 8)
  buf.writeUInt16LE(t, i * 8 + 2)
  buf.writeInt16LE(v, i * 8 + 4)
  buf.writeUInt8(kind, i * 8 + 6)
  indexOfKey.set(f * 32768 + t, i)
})

// curated.json: one entry per curated pair, with the ranges oriented to the stored (lo, hi) order.
const typeName = ['', 'quotation', 'allusion', 'echo']
const curatedOut = []
for (const [key, list] of curatedAt) {
  const first = list[0]
  const loIsA = first.A[0] === first.lo
  const notes = [...new Set(list.map((c) => c.note).filter(Boolean))]
  curatedOut.push({
    link: indexOfKey.get(key),
    type: typeName[Math.min(...list.map((c) => c.kind))],
    note: notes.join(' · '),
    lo: loIsA ? first.A : first.B,
    hi: loIsA ? first.B : first.A,
  })
}
curatedOut.sort((x, y) => x.link - y.link)

mkdirSync('public/data', { recursive: true })
writeFileSync('public/data/refs.bin', buf)
writeFileSync('public/data/books.json', JSON.stringify(books))
writeFileSync('public/data/kjv.json', JSON.stringify(text))
writeFileSync('public/data/curated.json', JSON.stringify(curatedOut))

const vs = recs.filter((r) => r[3] === 0).map((r) => r[2]).sort((x, y) => x - y)
const pct = (p) => vs[Math.floor(p * (vs.length - 1))]
console.log(`verses: ${text.length}, links: ${recs.length}, dropped: ${dropped}, merged duplicates: ${merged}`)
console.log(`curated: ${curated.length} entries -> ${curatedOut.length} links (${marked} matched an existing cross-reference, ${appended} appended)`)
console.log(`votes p10/p25/p50/p75/p90/max: ${[0.1, 0.25, 0.5, 0.75, 0.9, 1].map(pct).join(' / ')}`)
