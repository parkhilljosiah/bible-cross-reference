# Scripture Echoes: project context

Interactive arc diagram of Bible cross-references, built to explore intertextuality (e.g. how Revelation echoes
Daniel and Ezekiel). React 19 + TypeScript + Vite, no backend, no runtime dependencies beyond React. Published as a
static site on GitHub Pages: https://github.com/parkhilljosiah/bible-cross-reference

Inspired by Chris Harrison and Christoph Römhild's cross-reference arc diagram. Never copy their artwork.

## Commands

```bash
npm run dev          # http://localhost:5173  (add -- --host to test on a phone on the same Wi-Fi)
npm run build        # tsc -b && vite build -> dist/
npm run lint         # oxlint
node scripts/build-data.mjs   # regenerate public/data (needs data/raw/, see below)
```

Tests: `npm test` runs `tests/*.test.ts` with Node's built-in runner (Node strips the types itself; no framework). They cover
the reference parser only. For everything else verify with `npx tsc -b`, `npm run lint`, and the browser. CI runs lint, tests
and build before deploying.

## Architecture (src/)

| File | Role |
| --- | --- |
| `data.ts` | Loads `public/data/*`; per-verse adjacency (CSR) for fast "links touching this range" |
| `graph.ts` | `Filters`, `buildContext` (which links pass), `makeLayout` (baseline layout + zoom/pan `View`) |
| `raster.ts` | Additive arc rasterizer (float accumulation buffer + tone map); clips each arc to the visible x-range |
| `raster.worker.ts`, `rasterClient.ts` | Runs the rasterizer in a Web Worker; newer requests replace queued ones; one client per layer |
| `ArcCanvas.tsx` | Gestures (pinch/wheel/drag-pan/scrub), committed vs in-flight view, book strip, density bars, overlay |
| `Controls.tsx` | Header: book pickers, min votes, curated toggle, zoom-to-books, Reset all, Share link |
| `Sidebar.tsx` | Selection panel with translation pickers and passage text; on phones a draggable bottom sheet, or the "Top connected books" list when nothing is pinned |
| `BookChips.tsx` | Phone-only scrolling row of tappable books |
| `urlState.ts` | Query string <-> state (`between`, `and`, `votes`, `zoom`, `src`, `sel`, `tr`, `cmp`); App keeps the address bar in sync |
| `useMediaQuery.ts` | `MOBILE_QUERY` is `(max-width: 860px)` |

Data model: verses are indexed 0..31101 globally. A link is `a[i] < b[i]` with `votes[i]` and `kind[i]`
(0 = plain cross-reference, 1 quotation, 2 allusion, 3 echo). `refs.bin` is 8 bytes per link:
`a:u16, b:u16, votes:i16, kind:u8, pad:u8`, little-endian. Links are undirected; canonical order gives direction.

## Data pipeline

- `public/data/` (books.json, refs.bin, curated.json, translations.json, text/<ID>/<Book>.json) is **generated and
  committed**, so CI and hosting need no downloads (about 31 MB, most of it text). `bash scripts/fetch-raw.sh`
  downloads the sources into the git-ignored `data/raw/`; then `node scripts/build-data.mjs`.
- **Translations** come from scrollmapper/bible_databases (`formats/json/<ID>.json`): KJV, BSB, NHEB, ASV, YLT, Darby,
  Webster. Each is re-keyed to the KJV book/chapter/verse layout and written one file per book, fetched lazily when a
  passage is opened (`loadVerses` in `data.ts`). Verses a translation omits are stored as `''` and the UI says so.
  The KJV's small-caps LORD is restored from the older `en_kjv.json` (the scrollmapper KJV flattens it to "Lord").
  **OEB is unusable** (most verses empty in that dataset). WEB itself isn't in that repository; NHEB stands in.
  Selected translation lives in the URL (`tr`, `cmp`) and localStorage (`translation`).
- `data/curated/allusions.txt`: `later | earlier | type | note`, one link per line. The build script fails loudly on a
  bad reference. Re-run `node scripts/build-data.mjs` after editing.
- The curated list is a **starter set (~200 links) written by Claude from commonly cited parallels**. The type labels
  are editorial judgments and **need expert review before being presented as scholarship**.
- **Unverified:** per-text licensing. The translations are public domain by their own history, but the source
  repository states no per-translation license (and `en_kjv.json` none either). Confirm before promoting the site.

## Decisions and why (don't undo without a reason)

- **Custom rasterizer, not canvas `stroke()`.** One path's overlapping segments paint only once, so strokes can't give
  the additive glow of the original. Dense (>20k arcs) views render at 1x with nearest-pixel splats and are upscaled.
- **Highlight overlay uses a hue-preserving tone map** (`preserveHue`). Per-channel mapping washed big books out to white.
- **Highlights render on click, not on hover.** Hovering the strip only moves a DOM box (`.marker.hover`) and a name
  tooltip; the arc highlight (overlay raster) is driven by the pinned selection alone. Rendering one up-to-25k-arc highlight
  per pointer move was the cause of the lag when dragging across books. Measured by scrubbing 60 moves: 0 highlight renders
  and no long tasks; a click renders once (about 55-120 ms, heaviest book first). On phones, opening the bottom sheet
  resizes the canvas, so a selection can paint twice (once per size). Don't make hover trigger raster work again; if a
  hover preview is wanted, make it cheap (labels or counts), not an overlay render.
- **Dragging along the strip selects on release.** A drag that starts on the strip tracks only x (the finger may drift
  off the thin strip or past either end and still lands on the nearest book; `locateScrub`, `bookAt(x, Infinity)`), shows
  the hover box and a "Lift to select" tooltip, and on pointerup calls `onPin` itself. It does not wait for a `click`:
  phone browsers usually send none after a drag. A short-lived `suppressClick` stops a click that does follow from
  toggling the new selection off (it expires after 400 ms so it can't swallow the next tap); `pointercancel` selects
  nothing; a drag onto the selected book keeps it, a plain tap on it clears it. Drags started on the density bars select a
  verse range instead of a book.
- **Expanded phone sheet covers the diagram completely.** In the mobile media query the book chips, `.arc-wrap` and the
  sheet each get an explicit grid row; expanded, the sheet spans rows 2-3 (everything below the chips) at `z-index: 2`.
  The expanded state lives in `App` (`sheetExpanded`), and `ArcCanvas` gets `frozen` while it is covered: its
  ResizeObserver is disconnected, so the canvas keeps its size and expanding/collapsing renders nothing (measured: 0
  renders; without this the row grew to 702 px and forced a re-render each way). Clearing the selection collapses the sheet
  (`pin(null)` in `App`), so the next selection starts small. The explicit `grid-row`s matter: with the sheet spanning
  rows, auto-placement would push the diagram into a stray implicit row.
- **Verse search** (`reference.ts` parser, `SearchBox.tsx`): pure, tested parser turns "John 3:16", "1 Cor 13:4-7", "Ps 23",
  "Jude 5" (lone number in a one-chapter book = verse), "Gen 1:31-2:3", a bare book name, etc. into a verse range; unknown or
  out-of-range input gets a specific message ("John 3 has 36 verses."), ambiguous short forms ("Jo") get "did you mean". Over-long
  ends are clamped. A result is just a selection (`pin`), so the sidebar's strongest links *are* the cross-reference list, and it
  is shareable via `sel=`. A search lifts book filters/zoom that would hide the verse but leaves vote/curated filters alone; the
  sidebar counts what they hide (`countTouching`) and offers "Show all". Known gap: the OpenBible data anchors a cross-reference
  to a *range* at its first verse, so a verse in the middle of a referenced range (e.g. Prov 8:25 inside 8:22-30) won't list it.
- **Selecting must not resize the diagram.** On phones the area under the diagram holds the "Top connected books" list when
  nothing is selected and the sheet when something is; both are `42dvh` tall (`.sidebar.intro`, `.sidebar.sheet`; expanded
  uses `height: auto`). When they differed (48 vs 42), every search or clear resized the canvas, which re-rendered both layers
  ~70 ms later (longer on a real phone) and visibly reshaped the picture, with the highlight painted twice. Also, the base
  layer dims only after the highlight has painted (`dimmed` state in `ArcCanvas`, and not at all when the selection has no
  visible arcs); dimming on selection made a dark gap while the worker rendered. Measure with a drawImage hook on the base and
  overlay canvases plus a ResizeObserver on `.arc-wrap`: a search should show one overlay paint, the dim, and no resize.
- **Search completion** (`completeReference` in `reference.ts`, UI in `SearchBox.tsx`): the dropdown is staged. Books while the name
  is being typed; once the name is complete and followed by a space or number, a grid of chapters; a chapter that can only mean one
  thing (or `john 3:`) moves on to a grid of verses with a full-width "Whole chapter" entry. Typed digits filter by prefix (`ps 15`
  -> 15, 150). A number that doesn't exist (`Philippians 5`, `John 3:99`) returns a hint ("Philippians has 4 chapters.") plus the
  real options instead of an empty list; a failed Enter shows the same message in the dropdown (red) and keeps it open. One-chapter
  books skip the chapter step. Arrow keys move by `COLS` (6, must match the CSS grid), left/right only once an entry is
  highlighted (otherwise they are the text cursor). The popup is positioned against the input alone so it never covers Go, and
  cancels `mousedown` so the input keeps focus (blur would close it before a tap lands). `findBook` is shared by parsing and
  completion; both are covered by `tests/reference.test.ts`.
- **Rasterizer is cheap per render:** one reused accumulation buffer, a fixed ~20k-pixel exposure sample, and the result is
  only the band of rows the arcs touched (`top`/`height`/`fullHeight`). Markers are DOM, not canvas, so they never wait for
  the worker.
- **Zoom feedback:** during a gesture a CSS transform on `.layers` approximates the target view; after ~140 ms the view
  commits and the worker re-renders. `painted` vs `target` refs track the two.
- **Arcs are a true semicircle, anchored under the top bar** (`geo` in `ArcCanvas.tsx`); squashed only on short screens.
  The user asked for a shorter arc close to the header.
- **Touch edge zone:** on coarse pointers `PAD_X` is 30 px (and chip rows are inset 28 px) because iOS Safari's
  swipe-from-left-edge *back* gesture slides the whole page away (looks like a white background) and can't be cancelled.
- **Phones open on the full overview** (all connections), not a focused example. There are no preset buttons; there is
  a **Reset all** button.
- Taps in empty canvas space don't clear the selection on touch; the sheet has Clear, or drag it down to dismiss.
- Highlighting/selection dims the base layer to 22% opacity (also dims the book strip; known cosmetic issue).

## Deployment

Live at **https://parkhilljosiah.github.io/bible-cross-reference/** (GitHub Pages via `.github/workflows/deploy.yml`: lint, test,
build, upload, deploy on push to `main`; also manual `workflow_dispatch`). Every run since #2 has succeeded; pages are cached for a
few minutes, so right after a deploy add a throwaway query (`?x=1`) to see the new build. `vite.config.ts` uses `base: './'` so it works under `/bible-cross-reference/`.

- Pages must be enabled once: repo Settings -> Pages -> Source: **GitHub Actions**. (A 404 "Ensure GitHub Pages has
  been enabled" on deploy means this wasn't set.)
- **Don't use "Re-run failed jobs"**: build and deploy are one job, so it uploads a second `github-pages` artifact and
  deploy fails with "Multiple artifacts". Start a fresh run (Actions -> Deploy -> Run workflow, or push).
  Splitting into separate build and deploy jobs would make re-runs safe.
- Last known state: the build/lint/artifact steps passed in CI; the first deploy was blocked by the Pages setting and
  the duplicate-artifact issue above. Check the Actions tab for the current status.

## Working notes (tooling gotchas)

- The browser-pane preview tool looks for `.claude/launch.json` in the *session's* root, not this folder. Run
  `npm run dev` in a terminal and use `preview_start` with `url: http://localhost:5173` instead.
- Emulated viewport (`resize_window` presets) scales the page inside the pane; click coordinates are in the screenshot
  frame (often ~2x CSS px). Prefer `find`/refs or JS (`element.click()`) for clicks; reset to `desktop` when done.
  The pane at "desktop" is only ~800 px wide, so it still shows the mobile layout (breakpoint 860 px).
- Vite HMR can leave stale errors in the console log from older code; reload and re-check before trusting them.
- `npm create vite` refuses a non-empty directory; scaffold elsewhere and copy.
- The 300k-link overview is the performance stress case: drag the vote slider to 0. It currently produces no
  main-thread long tasks.

## Known issues and ideas

- Expand and review the curated allusion list (more books; scholarly sources and per-link citations).
- At deep zoom, arc legs become near-vertical lines. A flatter arc style could read better.
- Selection dims the book strip along with the arcs.
- Real-device testing is thin: gestures were verified with synthetic pointer events, not a real phone.
- Workflow warns that actions run on Node 24 although they target Node 20; bump action versions when current majors
  are confirmed.
- Possible: PWA manifest/Home Screen mode, a LICENSE file, tests for `graph.ts`/`urlState.ts`/the build script,
  top book *pairs* instead of single books in the phone list.

## On hold: copyrighted translations (ESV, NIV, NASB, NLT)

Paused by the owner until licensing is sorted out. **Nothing for this is built**; only the seven public-domain texts ship. What was
found (verify before relying; not legal advice):

- **ESV:** Crossway's own API (api.esv.org). Non-commercial only (no ads, sponsorship, donations or charging), doctrinal-fit
  condition, key by approval, **server-side only** (the key may not be published), 5,000 queries/day, 1,000/hour, 60/minute,
  max 500 verses or half a book per page and per query, may store up to that much, attribution and a link to esv.org required.
- **NIV:** Biblica. API.Bible offers no express licensing for it; contact Biblica (biblica.com permissions). Free non-commercial
  access via API.Bible was not confirmed.
- **NASB / NLT:** named in API.Bible's catalog, but whether the free Starter plan can add them (or they need a direct agreement
  with Lockman / Tyndale) can only be seen in an account's dashboard.
- **API.Bible Starter:** non-commercial, up to **3** licensed Bibles (so not all of NIV/NASB/NLT plus ESV), 5,000 calls/month, a
  FUMS tracking script is required on web apps, cache refresh every 14-30 days, copyright text on every display.
- **Architecture if resumed:** a small serverless proxy (e.g. a Cloudflare Worker) holding the keys, caching within each license,
  capping verses per request; the static site calls only the proxy. Keys never go in the repo. Fall back to the public-domain
  texts when a limit is hit. Open questions for the owner: stays free/ad-free? who creates the accounts and hosts the function?
