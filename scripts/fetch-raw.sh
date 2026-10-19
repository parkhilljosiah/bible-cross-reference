#!/usr/bin/env bash
# Downloads the raw source data into data/raw/ (git-ignored), then run: node scripts/build-data.mjs
# Skips files that are already present; delete a file to re-download it.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/raw

fetch() { # fetch <url> <file>
  if [ -s "data/raw/$2" ]; then echo "have  $2"; return; fi
  echo "fetch $2"
  curl -fsSL -o "data/raw/$2" "$1"
}

# Cross-references (CC-BY): https://www.openbible.info/labs/cross-references/
if [ ! -s data/raw/cross_references.txt ]; then
  fetch "https://a.openbible.info/data/cross-references.zip" cross_references.zip
  unzip -o -q data/raw/cross_references.zip -d data/raw
fi

# Bible texts: scrollmapper/bible_databases, formats/json/<ID>.json. Keep this list in sync with TRANSLATIONS in
# scripts/build-data.mjs.
for id in KJV BSB NHEB ASV YLT Darby Webster; do
  fetch "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/$id.json" "$id.json"
done

# Optional: only used to restore the KJV's small-caps LORD (the scrollmapper KJV prints "Lord" everywhere).
fetch "https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json" en_kjv.json

echo "done. Next: node scripts/build-data.mjs"
