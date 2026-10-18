# Scripture Echoes

An interactive arc diagram of Bible cross-references (React + TypeScript + Vite). Every arc joins two verses that
cross-reference each other. Filter to book pairs such as Revelation ↔ Daniel & Ezekiel, switch to a hand-curated layer
of quotations and allusions, pin a book, and read the linked passages side by side.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run lint
```

To try it on a phone on the same Wi-Fi: `npm run dev -- --host`, then open the printed `Network:` URL.

## Features

- **Arc overview** of ~300k links, rendered with additive blending in a Web Worker (the page never blocks).
- **Zoom and pan:** pinch, trackpad pinch (ctrl+wheel), mouse wheel, drag to pan, `+`/`−` buttons, and *zoom to
  selection*. Up to 400×.
- **Filters:** between / and book pickers, a minimum-votes slider, *zoom to chosen books*, *Reset all*.
- **Curated allusions:** a toggle that shows only editorially chosen links, typed as quotation, allusion or echo.
- **Selection panel:** connected books, strongest links, KJV text for both ends; a draggable bottom sheet on phones.
- **Shareable URLs:** the address bar always reflects the current view (see below). *Share link* copies it.

### URL parameters

| Parameter | Meaning | Example |
| --- | --- | --- |
| `between` | Books in the first group (OpenBible abbreviations) | `between=Rev` |
| `and` | Books in the second group | `and=Dan,Ezek` |
| `votes` | Minimum votes for plain cross-references (default 4) | `votes=10` |
| `zoom` | `1` compresses the baseline to the chosen books | `zoom=1` |
| `src` | `curated` shows only curated links | `src=curated` |
| `sel` | Pinned selection: a book, a verse, or a range | `sel=Rev`, `sel=Rev.1.7`, `sel=Ps.22.1-Ps.22.31` |

Example: `/?between=Rev&and=Dan,Ezek&src=curated&zoom=1&sel=Rev`

## Data

`public/data/` is generated output committed to the repo, so the app (and CI) needs no data download. To rebuild it:

1. Download into `data/raw/` (git-ignored):
   - `cross_references.txt` from the [OpenBible.info cross-references](https://www.openbible.info/labs/cross-references/) zip
   - `en_kjv.json` from [thiagobodruk/bible](https://github.com/thiagobodruk/bible/blob/master/json/en_kjv.json)
2. Edit `data/curated/allusions.txt` if you are changing the curated layer.
3. `node scripts/build-data.mjs`

### The curated layer

`data/curated/allusions.txt` is a plain-text list, one link per line: `later text | earlier text | type | note`.
Types are `quotation` (close verbal citation), `allusion` (clear reference to imagery or wording) and `echo` (thematic
or verbal resonance, more debatable). References look like `Rev.1.7`, `Rev.1.13-15` or `Rev.1.1-Rev.1.3`, and a link
is anchored at the first verse of each range. The build script fails loudly on an unknown book, chapter or verse.

The current file is a **starter set (~200 links)** based on commonly cited parallels. The classifications are my own
editorial judgments, not a transcription of any commentary, and **should be reviewed by someone with expertise before
you present them as scholarship**. About 90% of the entries also appear in the community cross-reference data; the
rest are added as new links.

## How it works

| File | Role |
| --- | --- |
| `scripts/build-data.mjs` | Maps refs to global verse indices (0–31,101), dedupes A↔B/B↔A, merges the curated layer, writes `refs.bin` (8 bytes/link), `books.json`, `curated.json`, `kjv.json` |
| `src/data.ts` | Loads the binary data; builds per-verse adjacency (CSR) for fast "links touching this range" lookups |
| `src/graph.ts` | Filters, the baseline layout, and the zoom/pan view transform |
| `src/raster.ts` | Additive arc rasterizer: accumulates arcs in a float buffer, then tone-maps. Canvas `stroke()` can't blend overlapping arcs within one path. Clips each arc to the visible x-range so deep zoom stays cheap |
| `src/raster.worker.ts`, `src/rasterClient.ts` | Runs the rasterizer off the main thread; newer requests replace queued ones |
| `src/ArcCanvas.tsx` | Gestures, committed vs. in-flight view (a CSS transform gives instant feedback while the worker re-renders), book strip, density bars |
| `src/urlState.ts` | Reads and writes the query string |
| `src/Sidebar.tsx` | Connected books, strongest links, passages, the phone bottom sheet |

## Deploying

The build uses relative asset paths, so `dist/` works from the site root or any subfolder.

- **GitHub Pages:** push to `main` with Pages set to *Settings → Pages → Source: GitHub Actions*. The workflow in
  `.github/workflows/deploy.yml` lints, builds and publishes.
- **Netlify / Vercel / Cloudflare Pages:** build command `npm run build`, output directory `dist`.

## Data and attribution

- Cross-references: [OpenBible.info](https://www.openbible.info/labs/cross-references/), CC-BY. Votes are community
  scores, so low-vote links are weak evidence of literary dependence.
- Text: King James Version. The KJV text itself is public domain in the US, but **confirm the license of the specific
  JSON file you use before publishing**; if in doubt, swap in a source with an explicit public-domain declaration.
- Inspired by Chris Harrison and Christoph Römhild's cross-reference arc diagram. No part of their artwork is used.
