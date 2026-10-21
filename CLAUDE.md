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

There are **no automated tests**. Verify changes with `npx tsc -b`, `npm run lint`, and the browser.

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

GitHub Pages via `.github/workflows/deploy.yml` (lint, build, upload, deploy on push to `main`; also manual
`workflow_dispatch`). `vite.config.ts` uses `base: './'` so it works under `/bible-cross-reference/`.

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
