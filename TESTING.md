# Manual test checklist

Run this after a deployment. The automated checks (lint, 35 tests, build) already run in CI before anything deploys; this list
covers what they can't: how the live site looks and feels on real browsers and phones.

**How to use it:** on GitHub open **Issues → New issue** and pick a **Release check** template (smoke test, full pass, or data
rebuilt). The checklist arrives as clickable checkboxes with the golden links as real links; tick them off as you go and close the
issue when you're done, which leaves a history of every release. (Prefer a note? Copy the sections you need from here.) If
something fails, write down the device, browser, URL, steps, what you expected and what happened (see section 7).

| Pass | When | Time |
| --- | --- | --- |
| **Smoke test** (sections 0 to 2) | Every deploy | about 10 min |
| **Full pass** (section 3) | After a new feature or a fix to a feature | about 30 min |
| **Data check** (section 4) | After rebuilding the data (`node scripts/build-data.mjs`) | about 10 min |

Live site: `https://parkhilljosiah.github.io/bible-cross-reference/` (below, `/` means that address).

---

## Golden links

Open each in a fresh tab. These are the fixed points the rest of the list refers to. The numbers come from the data as built on
2026-11-02; if you rebuild the data, update them here (section 4).

| Link | Should show |
| --- | --- |
| `/` | **133,357 of 301,559 links**; a "Top connected books" list or intro; Psalms 25,571, Isaiah 15,232, Matthew 12,262 at the top |
| `/?src=curated` | **197 of 301,559 links** |
| `/?sel=John.3.16` | Title "John 3:16", the KJV text ("For God so loved the world…"), **61 links**, a note "**19 more** cross-references are hidden by your filters. Show all". Top links start Rom 5:8, 1John 4:9, Rom 8:32 |
| `/?between=Rev&and=Dan,Ezek&src=curated&zoom=1` | **49 of 301,559 links**; only Ezekiel, Daniel and Revelation on the strip |
| `/?sel=Matt.17.21&tr=BSB&cmp=KJV` | BSB: "Not in this translation’s base text." KJV: "Howbeit this kind goeth not out but by prayer and fasting." |
| `/?q=son+of+man` | **193 verses in the King James Version**; "Ezekiel 93 · Matthew 30 · Luke 26 · Mark 14 · John 11"; first result Numbers 23:19 |
| `/?q=son+of+man&qm=words` | **273 verses** (the "All the words" mode is on) |
| `/?q=lamb+of+god` | **2 verses**: John 1:29 and John 1:36 |

---

## 0. Before you test (2 min)

- [ ] **GitHub → Actions:** the latest *Deploy* run is green. If it's queued or running, wait. If it's red, stop and get the error.
- [ ] **Bypass the cache.** GitHub Pages caches the page for about 10 minutes, so right after a deploy you can be looking at the
      old build. Open the site with a throwaway address, e.g. `/?x=1`, on every device you test.
- [ ] **Confirm it's the new build.** Either the new feature is visible, or (desktop) DevTools → Network → the `index-….js` file
      name differs from last time.
- [ ] **Console is clean** (desktop: DevTools → Console). No red errors on load.

---

## 1. Desktop smoke test (5 min)

Use a wide window (over 900 px) so you get the two-column layout. Chrome first.

- [ ] **Loads:** `/` shows the arc diagram, the book strip with labels, and the right-hand panel. Header says **133,357 of 301,559 links**.
- [ ] **Select a book:** click Psalms on the strip. Arcs light up in several colors (not a white blob). The panel shows "Psalms",
      a link count, "Most connected books" and "Strongest links".
- [ ] **Hover does nothing heavy:** move the mouse across the strip. A white box and a name tooltip follow; no arcs are redrawn.
- [ ] **Open a link:** click the first "Strongest links" entry. Both passages show with text.
- [ ] **Verse search:** type `John 3:16`, press Enter. Matches the golden link (61 links, 19 hidden). Click **Show all**; the count rises to 80.
- [ ] **Word search:** type `son of man`, press Enter. Matches the golden link (193 verses, Ezekiel 93). The phrase is highlighted
      in each result and gold bars appear under the strip.
- [ ] **Shared link:** open `/?sel=John.3.16` in a new tab. It opens with John 3:16 selected.
- [ ] **Share link button:** click it, paste somewhere; the address is the current view.

---

## 2. Phone smoke test (5 min)

On a real phone, portrait. Do iPhone Safari at least; add Android Chrome when you can.

- [ ] **Layout:** header (title, count, Filters), search box with **Go**, a row of book chips that scrolls sideways, the diagram,
      and the "Top connected books" list under it. Nothing cut off; the page doesn't scroll sideways.
- [ ] **Slide to select:** put a finger on the book strip, slide along it, lift on a book. While sliding you see a box and
      "Lift to select"; on lifting the book is selected and the sheet opens.
- [ ] **Start at the far left** of the strip (Genesis). The page must not slide away (iOS Safari's back-swipe starts within about
      20 px of the left edge; the strip is inset 30 px to stay clear of it).
- [ ] **The diagram doesn't jump.** Select a book, then clear it. The arcs stay the same size and don't reshape or flash.
- [ ] **Bottom sheet:** opens about 40% of the screen. **Expand** covers everything below the chips. Dragging the handle down
      collapses it; dragging all the way down dismisses it.
- [ ] **Search box:** tap it. The keyboard opens and the **page does not zoom in**. Type `Philippians 5`: a message "Philippians
      has 4 chapters." and buttons 1 to 4. Tap 2, then a verse: that verse is selected.
- [ ] **Word search:** type `lamb of god`, choose "Search the text for…" (or press Go). Results: John 1:29 and John 1:36.

---

## 3. Full pass (after feature changes)

### 3.1 Diagram and selection (desktop)
- [ ] **Click to select, click again to clear.** Selecting a book opens its panel; clearing returns to the intro.
- [ ] **Click the bars** under the strip: selects a stretch of verses (the title shows a verse range).
- [ ] **Colors:** select Psalms and Isaiah; the highlight arcs keep their colors, not white.
- [ ] **Zoom:** the **+** and **−** buttons, mouse wheel, and trackpad pinch all zoom. When zoomed, dragging in empty space pans.
      The **⤢** button zooms to the selection. The "N×" button resets.
- [ ] **Deep zoom:** select Revelation and press ⤢ (about 77×). It stays responsive; the strip labels stay readable.
- [ ] **Slider and filters stay smooth:** drag **Min votes** from 4 to 0 and back; the page doesn't freeze. At 0 it shows about
      300,500 links.

### 3.2 Filters
- [ ] **Curated allusions only (197):** `/?src=curated` gives 197 links. The vote slider is disabled; arcs are gold, teal and violet;
      the legend in the sidebar explains quotation / allusion / echo.
- [ ] **Between / And:** the golden link with Rev, Dan and Ezek gives 49 links and three books. Remove a tag with its ×.
- [ ] **Zoom to chosen books:** off, the strip shows all 66 books again.
- [ ] **Reset all:** disabled at the defaults, enabled after any change; pressing it restores 133,357.

### 3.3 Passages and translations
- [ ] **Seven translations** in the picker: KJV, BSB, NHEB, ASV, YLT, Darby, Webster.
- [ ] **Switching** changes the passage text. The choice is remembered after a reload when the address has no `tr=`.
- [ ] **Compare with** shows two translations stacked, each tagged (BSB, KJV).
- [ ] **A verse a translation omits:** the Matt 17:21 golden link.
- [ ] **KJV divine name:** Exodus 3:15 (`/?sel=Exod.3.15`) in the KJV shows "The LORD God of your fathers…" with LORD in capitals.
      (A few hundred verses wrongly show "Lord"; see section 5.)
- [ ] **A link's note:** open a curated link (e.g. Rev 1:7 ↔ Dan 7:13); an italic note and both passages appear.

### 3.4 Verse search
- [ ] **Formats work:** `John 3:16`, `jn 3.16`, `1 Cor 13:4-7`, `Ps 23`, `Jude 5` (verse 5), `Rev` (whole book), `Gen 1:31-2:3`.
- [ ] **Guided entry:** type `phi` and see Philippians and Philemon; choose one to get a grid of chapters; choose a chapter for a
      grid of verses with a "Whole chapter" button; choose a verse to search it.
- [ ] **Keyboard:** `/` focuses the box; arrow keys move through the lists; Enter chooses; Esc closes.
- [ ] **Errors say what's wrong:** `Philippians 5` → "Philippians has 4 chapters." with 1 to 4 offered; `John 3:99` → "John 3 has 36
      verses."; `Philipians 4:13` → "Did you mean Philippians…". None of these changes the current result.
- [ ] **Search while filtered:** open `/?between=Rev&and=Dan&zoom=1&src=curated`, search `John 3:16`. The book filter and zoom are
      lifted and the panel says how many links the other filters hide.

### 3.5 Word and phrase search
- [ ] **Counts match** the golden links (193 phrase, 273 all-words, `lamb of god` = 2).
- [ ] **Whole words only:** `man` does not light up `woman` or `manna`.
- [ ] **Result click and back:** click a result: that verse opens with its cross-references and the button reads **← Results**.
      Pressing it returns to the list.
- [ ] **Switch translation while results are open:** it searches that translation instead (BSB 186, ASV 190, YLT 193 for "son of man").
- [ ] **Show more** adds 40 results each press ("Show more (153 left)" at first).
- [ ] **First search in a translation** shows a loading bar, then results. Going back to a translation you just used shows **no**
      loading bar.
- [ ] **Routing:** `love` searches the text; `Mark` goes to the book (with a "Search the text for…" row offered under it); a mistyped
      reference stays an error.
- [ ] **Close** clears the results and the `q=` in the address.

### 3.6 Links and the address bar
- [ ] The address updates as you select, filter, switch translation, and search. Copy it into a new tab: the same view returns.
- [ ] Each parameter round-trips: `between`, `and`, `votes`, `zoom`, `src`, `sel`, `tr`, `cmp`, `q`, `qm`.
- [ ] A made-up or broken address (`/?sel=Foo.1.1&tr=XYZ&votes=banana`) opens the normal page without errors.

### 3.7 Phone extras
- [ ] **Landscape:** still usable (rotate and back).
- [ ] **Filters** opens a panel over the diagram without pushing the layout; **Share link** opens the share sheet.
- [ ] **Pinch to zoom the diagram** works; the page itself doesn't zoom.
- [ ] **The bottom of the sheet isn't hidden** by the home indicator or browser bar.
- [ ] **Book chips:** tapping one selects it; the chip row scrolls to keep the selected one in view.

### 3.8 Other browsers
Repeat the smoke tests on Safari and Firefox (desktop) and Android Chrome. Things that tend to differ: canvas drawing, pointer and touch
handling, the clipboard, scrolling.

### 3.9 Accessibility quick checks
- [ ] **Keyboard only:** Tab through the header; every control shows a visible focus ring; Enter works on buttons and the search box.
- [ ] **200% browser zoom:** the layout is still usable.
- [ ] **Text is readable** against the dark background (zoom in on the sidebar and the dropdown).

### 3.10 Feel
- [ ] First load is a few seconds at most on a normal connection.
- [ ] Sliding a finger or mouse across the strip is smooth; selecting a book draws within about a third of a second.
- [ ] The first word search in a translation (about 1.25 MB) finishes in a few seconds on mobile data, with progress shown.

---

## 4. When the data changes

Only after rebuilding with `node scripts/build-data.mjs`.

- [ ] `npm test` passes (it reads the data and checks the verse count and classic phrases).
- [ ] 66 books on the strip; the Bible has 31,102 verses; the link total in the header is as expected.
- [ ] "Curated allusions only (N)" shows the new count; open three curated links and check each shows a type and a note.
- [ ] Open a passage in each of the seven translations (try Genesis 1:1 and Revelation 22:21).
- [ ] **Update the numbers in this file** (golden links, counts, and the "Show more" figure).

---

## 5. Known behavior (not bugs)

- **A verse inside a referenced range** (e.g. Prov 8:25 inside 8:22-30) doesn't list that link: the cross-reference data attaches it to the first verse only.
- **Returning to results from a verse** puts the list back at the top.
- **The first word search per translation** downloads about 1.25 MB; the site doesn't keep it between visits for long (pages are cached 10 minutes).
- **Right after a deploy** you may see the old version for a few minutes; use `?x=1`.
- **iOS Safari's back-swipe** can still take over a drag that begins in the first ~20 px of the screen edge.
- **KJV "Lord" instead of "LORD" in 205 verses.** The KJV prints the divine name in small capitals (LORD, GOD). About 5,400 verses
  are right, but 205 are not, mostly Psalms whose title is part of verse 1 (e.g. Psalm 23:1 and 110:1) and some in 1 Samuel, Judges,
  2 Kings and Isaiah. This is a known data bug, not a regression; remove this line when it's fixed.
- **Copyrighted translations** (ESV, NIV, NASB, NLT) aren't available; that work is on hold pending licensing.
- **The curated allusion list** is a starter set pending expert review, not an authoritative list.

---

## 6. Test log (copy per release)

```
Release:            (commit / date)
Deploy run green:   [ ]   New build confirmed: [ ]
Desktop (browser):  smoke [ ]  full [ ]
iPhone Safari:      smoke [ ]  full [ ]
Android Chrome:     smoke [ ]  full [ ]
Problems found:
```

## 7. Reporting a problem

Write down: device and OS, browser and version, the address (with everything after the `?`), the steps, what you expected, what happened,
a screenshot or screen recording, and any red text in the console. For slowness, say when it happens (on load, when selecting,
when sliding, on the first search) and roughly how long it takes.

## Keeping this list current

When a feature is added or a bug is fixed, add one line here for it (a bug that's been fixed once is the likeliest to come back).
If the data is rebuilt, update the numbers.

**After editing this file, run `npm run checklists`** and commit the regenerated files in `.github/ISSUE_TEMPLATE/`. The issue
templates are generated from this file (sections 0 to 5 and the golden links), and `npm test` fails if they are out of date, so a
forgotten step is caught before it deploys.
