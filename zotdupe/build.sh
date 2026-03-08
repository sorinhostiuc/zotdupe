#!/bin/bash
# Build ZotDupe .xpi plugin for Zotero 7
set -e
cd "$(dirname "$0")"

# Clean previous build
rm -f ../zotdupe.xpi

# Package (exclude dev files)
zip -r ../zotdupe.xpi \
  manifest.json \
  bootstrap.js \
  prefs.xhtml \
  src/ \
  icons/ \
  locale/ \
  -x "*.DS_Store" \
  -x "__MACOSX/*" \
  -x "src/ui/*.css.bak"

echo "Built zotdupe.xpi ($(du -h ../zotdupe.xpi | cut -f1))"
