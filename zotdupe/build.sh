#!/bin/bash
# Build ZotDupe .xpi plugin
set -e
cd "$(dirname "$0")"

VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*: *"\(.*\)".*/\1/')
XPI_PATH="../zotdupe-${VERSION}.xpi"

# Clean previous build
rm -f "$XPI_PATH"

# Package (exclude dev files)
zip -r "$XPI_PATH" \
  manifest.json \
  bootstrap.js \
  prefs.xhtml \
  src/ \
  icons/ \
  locale/ \
  -x "*.DS_Store" \
  -x "__MACOSX/*" \
  -x "src/ui/*.css.bak"

echo "Built $(basename "$XPI_PATH") ($(du -h "$XPI_PATH" | cut -f1))"
