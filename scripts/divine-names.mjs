// The King James Bible prints the divine name in small capitals: the Hebrew name YHWH is "LORD" (and "GOD" in "Lord GOD"), while
// the title Adonai is "Lord"/"God". The scrollmapper KJV text writes every one as "Lord" or "God", which loses that distinction. The
// older en_kjv.json keeps it, but its wording differs slightly in places (e.g. a psalm's title inside verse 1), so verses can't be
// matched whole.
const WORD = /\b(lord|god)\b/gi

/**
 * Returns `verse` with the capitalisation of its Lord/God words copied from `original`, when the verse's sequence of those words (ignoring
 * case) matches the start of the original's. The original may have more of them at the end, because its margin notes ("…: Heb. from
 * the LORD") are appended after the verse; those extra words are ignored. If the verse has more of them than the original (a psalm
 * title only one source includes) or they differ in order, nothing is guessed and `verse` is returned unchanged. Only the
 * capitalisation changes; every other character of `verse` is kept.
 */
export function restoreDivineNames(verse, original) {
  const mine = [...verse.matchAll(WORD)]
  const theirs = [...original.matchAll(WORD)]
  if (mine.length === 0 || theirs.length < mine.length) return verse
  for (let i = 0; i < mine.length; i++) {
    if (mine[i][0].toLowerCase() !== theirs[i][0].toLowerCase()) return verse
  }
  let out = ''
  let at = 0
  mine.forEach((m, i) => {
    out += verse.slice(at, m.index) + theirs[i][0]
    at = m.index + m[0].length
  })
  return out + verse.slice(at)
}
