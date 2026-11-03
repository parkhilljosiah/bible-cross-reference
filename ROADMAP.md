# Roadmap: ideas for improving Scripture Echoes

A parking place for enhancements, so we can pick one up later without starting from scratch. Nothing here is committed to; the
order is a recommendation. Last updated: 2026-11-02.

**Effort** is relative to what's already built: **S** = a few hours, **M** = a day or two, **L** = bigger. **Status:** Idea, Scoped
(thought through, ready to build), In progress, Done.

**When you pick one up:** build it, add its checks to `TESTING.md` (then run `npm run checklists`), update this file (move it to
"Shipped"), and mention it in the commit message with `[full]` if it deserves the full release checklist.

---

## Suggested order

1. **Browser Back button works** (S)
2. **About / Help page** (S)
3. **Automated golden-link tests** (M)
4. **Installable and offline** (M)
5. **Shared-word highlighting in linked passages** (M)

Then, as interest and review allow: chapter heat map, suggested echoes, chapter reader, saved views, accessibility pass.

---

## Backlog

### Deepen the core purpose (how scripture echoes scripture)

| Idea | What it adds | Effort | Status |
| --- | --- | --- | --- |
| **Shared-word highlighting** | In a linked pair of passages, highlight the words both share ("son of man", "clouds", "white as wool"). Shows *why* two verses are linked. | M | Idea |
| **Chapter heat map for a book pair** | For Revelation ↔ Daniel, a small grid of which chapters echo which. | M | Idea |
| **Suggested echoes** (curation aid) | An offline script proposes linked verses that share multi-word phrases, for a reviewer to accept or reject. | M | Idea |
| **Direction filter (OT → NT only)** | Show only links where a later verse points back to an earlier one. | S | Idea |
| **More curated links, with citations** | Cover more books; give each link a source. Needs expert review. | ongoing | Needs owner |

**Shared-word highlighting.** Build on `normalize`, `parseQuery` and `highlight` in `src/textSearch.ts` and the `PassageText` component in
`src/Sidebar.tsx`. Compute the words (or runs of 2+ words) that occur in both passages, ignoring very common words (needs a small
stopword list). Test case: Rev 1:13 ↔ Dan 7:13 should mark "son of man". Decision: highlight single shared words, or only phrases?

**Chapter heat map.** Count links per (chapter of A, chapter of B) from the data (`chapterOf`, adjacency in `src/data.ts`); a new
component for the grid; tapping a cell filters to that pair of chapters. Needs a phone layout (the grid must fit in the 42% sheet or
get its own view).

**Suggested echoes.** A script (e.g. `scripts/suggest-echoes.mjs`) reusing `buildIndex` over a translation: for each cross-reference
pair, find shared runs of 3+ words that aren't just common phrases; write a CSV for review; accepted rows go into
`data/curated/allusions.txt`. Expect false positives; it only proposes.

**Direction filter.** Links are stored with `a < b` (earlier verse first), so "OT → NT" is "a is in the OT, b is in the NT". Add a
field to `Filters` in `src/graph.ts`, a checkbox in `Controls.tsx`, and a URL parameter in `src/urlState.ts`.

### Study experience

| Idea | What it adds | Effort | Status |
| --- | --- | --- | --- |
| **Chapter reader** | Read a chapter as text with a small marker on each verse showing its number of cross-references; tap a verse to see them. | L | Idea |
| **Context around a passage** | A "show the verses before and after" toggle on any passage. | S | Idea |
| **Saved views with notes** | Save a view and a note on the device (no accounts, no server); export and import. | M | Idea |
| **Share a passage nicely** | Copy a passage with its reference, or make a shareable image of two linked passages. | S–M | Idea |

**Chapter reader.** Text comes from the per-book files (`loadVerses` in `src/data.ts`); per-verse link counts from the adjacency
arrays. Needs a URL form (e.g. `?read=John.3`) and a phone-friendly layout.

**Saved views.** A list in `localStorage` of `{ name, address, note, date }`; the "address" is just the current query string, which
already captures the whole view. Decision: is "on this device only" enough?

**Share a passage.** `navigator.share` on phones. Copyrighted translations would need their notice included, but only
public-domain texts ship today.

### Phone and reach

| Idea | What it adds | Effort | Status |
| --- | --- | --- | --- |
| **Browser Back button works** | Back returns to the previous selection or search instead of leaving the app. | S | Idea |
| **Installable and offline** | Add to Home Screen; the data and text are kept on the device. | M | Idea |
| **Accessibility pass** | Arrow-key navigation of the diagram, a spoken summary of the selection, a light theme. | M | Idea |

**Back button.** `src/App.tsx` writes the address with `history.replaceState`, so history never grows. Push a new entry for discrete
changes (selecting, searching, switching view) and keep replacing for continuous ones (the vote slider, zoom), and restore state on
`popstate`. Test: select a book, search a verse, press Back twice.

**Installable and offline.** A web manifest, icons, and a service worker that caches the app shell, `public/data/*` and visited text.
Mind the GitHub Pages sub-path (`/bible-cross-reference/`) and an update flow so people don't get stuck on an old version. Bonus: it
also removes the repeat 1.25 MB text downloads and the iOS left-edge-swipe problem (an installed app has no back-swipe).
GitHub Pages sets `max-age=600` and we can't change it, which is why a service worker is the way to cache for longer.

**Accessibility pass.** The strip and diagram are a canvas; the chips and sidebar are already real controls. Add keyboard selection
on the strip, a live-region sentence describing the selection, and a light theme (the colors are already CSS variables).

### Trust and publishing

| Idea | What it adds | Effort | Status |
| --- | --- | --- | --- |
| **About / Help page** | Data sources and licenses, how to read the diagram, what "votes" mean, shortcuts, known limits. | S | Idea |
| **Privacy-friendly usage counts** | See which features people use. | S–M | Needs owner |

**About / Help.** Mostly content that already exists in the README and `TESTING.md` section 5. Do this before promoting the site.

**Usage counts.** Choose a cookie-free service (e.g. GoatCounter, Plausible or Cloudflare Web Analytics) and say so on the About page.
Decision: do you want any tracking at all?

### Quality

| Idea | What it adds | Effort | Status |
| --- | --- | --- | --- |
| **Automated golden-link tests** | A headless-browser test of the golden links, run after each deploy against the live site. | M | Idea |
| **Friendlier load failures** | A retry button instead of a plain error message. | S | Idea |

**Golden-link tests.** Use Playwright. Drive it from the golden-link table in `TESTING.md` so there is one source of truth (the table
lists each address and its expected text). Run it in CI after the deploy and fail the `release-check` job's issue (or comment on it)
when something is off. It would automate most of the desktop half of the smoke test; the phone-only checks stay manual.

---

## Performance options (from the text-search analysis; only if a real phone needs them)

Measured numbers are in `CLAUDE.md` ("Text-search performance"). In rough order of value:

1. **Cache text on the device** (service worker / IndexedDB). Overlaps with "Installable and offline".
2. **Move indexing and search into a worker.** The ~45 ms index build runs on the main thread once per translation; phones may hitch.
3. **Virtualize the results list.** "Show more" costs grow with the number of rows.
4. **A prebuilt word index** to download only the books containing matches. Unproven that it beats 1.25 MB for common words.

---

## Parked

| Item | Why it's waiting |
| --- | --- |
| **ESV, NIV, NASB, NLT translations** | Waiting on licensing. The findings and the design if resumed are in `CLAUDE.md` ("On hold: copyrighted translations"). |
| **Expanding the curated allusion list** | Needs someone with expertise to review the ~200-link starter set first. |

## Needs you (not code)

- Try the app on a real phone using `TESTING.md` section 2 (slide-to-select, the search box with the phone keyboard, the first-search download).
- Confirm the license of each translation text file for your use before promoting the site.
- Set the repo's **About** box website to the Pages URL.

---

## Shipped (for context)

Arc diagram with filters and zoom/pan; click and slide-to-select; curated allusions; seven public-domain translations with compare; verse
search with book, chapter and verse suggestions and typo help; word and phrase search; shareable links; phone layout with a bottom
sheet; manual test checklist with release-check issues opened automatically after each deploy; KJV small-caps LORD restored.
