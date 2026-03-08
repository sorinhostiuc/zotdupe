# ZotDupe Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build ZotDupe, a Zotero 7+ plugin that detects semantic duplicates across item types using a 7-layer matching algorithm, with cross-type merge support and a 4-screen UI.

**Architecture:** Bootstrap plugin with modular JS — separate files for normalization, blocking, scanning (7 layers), scoring, canonical selection, and merging. UI via XHTML dialogs with HTML content. No external dependencies — pure Zotero JS API.

**Tech Stack:** JavaScript (Zotero internal API), XHTML dialogs, CSS, Zotero 7+ bootstrap plugin format (.xpi)

**Design doc:** `docs/plans/2026-03-08-zotdupe-design.md` (the full specification)

---

### Task 1: Project Scaffolding

**Files:**
- Create: `zotdupe/manifest.json`
- Create: `zotdupe/bootstrap.js`
- Create: `zotdupe/prefs.js`
- Create: `zotdupe/locale/en-US/zotdupe.ftl`
- Create: `zotdupe/locale/ro-RO/zotdupe.ftl`

**Step 1: Create manifest.json**

```json
{
  "manifest_version": 2,
  "name": "ZotDupe",
  "version": "1.0.0",
  "description": "Semantic Duplicate Detector for Zotero",
  "author": "ZotDupe Contributors",
  "icons": {
    "48": "icons/zotdupe-48.png",
    "96": "icons/zotdupe-96.png"
  },
  "applications": {
    "zotero": {
      "id": "zotdupe@zotero-plugins.org",
      "update_url": "",
      "strict_min_version": "7.0",
      "strict_max_version": "7.1.*"
    }
  }
}
```

**Step 2: Create bootstrap.js**

Lifecycle hooks: startup loads all src/ modules via `Services.scriptloader.loadSubScript()`, registers menu item under Tools ("ZotDupe: Scan for Duplicates..."), registers preferences pane. shutdown removes all UI elements and nullifies references. onMainWindowLoad/Unload add/remove the Tools menu item per window.

**Step 3: Create prefs.js**

Default preferences:
- `extensions.zotdupe.threshold` = `"balanced"` (strict/balanced/relaxed)
- `extensions.zotdupe.enableLegalFingerprint` = `true`
- `extensions.zotdupe.enablePreprintDetection` = `true`
- `extensions.zotdupe.enableTranslationDetection` = `false`
- `extensions.zotdupe.enableCrossType` = `true`
- `extensions.zotdupe.enableMinHash` = `false`

**Step 4: Create locale files**

Basic Fluent strings for both en-US and ro-RO: menu labels, dialog titles, button labels, status messages.

**Step 5: Create placeholder icon**

Create `zotdupe/icons/` directory with a simple SVG icon (purple-blue "ZD" text).

**Step 6: Commit**

```bash
git add zotdupe/
git commit -m "feat: scaffold ZotDupe plugin structure"
```

---

### Task 2: Normalization Utilities

**Files:**
- Create: `zotdupe/src/utils/normalize.js`
- Create: `zotdupe/tests/test-normalize.js`

**Step 1: Write test file for normalization**

Test cases:
```javascript
// Title normalization
assert(normalizeTitle("The Machine Learning in Forensic...") === "machine learning in forensic...");
assert(normalizeTitle("Legea nr. 104/2003 privind manipularea") === "legea nr 1042003 manipularea");
// Diacritics removal
assert(removeDiacritics("ăîșțâ") === "aista");
// DOI normalization
assert(normalizeDOI("https://doi.org/10.1016/j.forsci.2023") === "10.1016/j.forsci.2023");
assert(normalizeDOI("DOI: 10.1016/j.forsci.2023") === "10.1016/j.forsci.2023");
// ISBN normalization
assert(normalizeISBN("978-3-16-148410-0") === "9783161484100");
assert(normalizeISBN("0-306-40615-2") === "9780306406157"); // ISBN-10 -> ISBN-13
// URL normalization
assert(normalizeURL("https://www.example.com/path/?q=1") === "example.com/path");
// Author normalization
assert(normalizeAuthor({lastName: "Ștefănescu", firstName: "Ion"}) === "stefanescu");
// Jaccard similarity
assert(jaccardSimilarity("machine learning forensic", "machine learning in forensic") >= 0.75);
```

**Step 2: Implement normalize.js**

Functions to implement:
- `removeDiacritics(str)` — Unicode NFKD decomposition, strip combining marks
- `normalizeTitle(title)` — lowercase, removeDiacritics, strip punctuation, collapse spaces, remove leading articles ("the", "a", "an", "un", "o", "la", "le", "les"), remove legal noise words ("privind", "referitor la", "pentru modificarea", "cu privire la"), trim
- `normalizeDOI(doi)` — lowercase, strip prefixes (https://doi.org/, http://dx.doi.org/, doi:), trim
- `normalizeISBN(isbn)` — strip hyphens/spaces, convert ISBN-10 to ISBN-13
- `normalizeURL(url)` — strip protocol, www, trailing slash, query params
- `normalizeAuthor(creator)` — lowercase lastName, removeDiacritics
- `jaccardSimilarity(a, b)` — word-level Jaccard index
- `levenshteinDistance(a, b)` — character-level edit distance
- `normalizedLevenshtein(a, b)` — 1 - (levenshtein / max(len_a, len_b))

**Step 3: Commit**

```bash
git add zotdupe/src/utils/normalize.js zotdupe/tests/
git commit -m "feat: add normalization utilities (title, DOI, ISBN, URL, authors)"
```

---

### Task 3: Legal Fingerprinting

**Files:**
- Create: `zotdupe/src/legal-fingerprint.js`
- Create: `zotdupe/tests/test-legal-fingerprint.js`

**Step 1: Write tests**

```javascript
// Romanian legislation
assert.deepEqual(extractLegalFingerprint("Legea nr. 104/2003 privind manipularea cadavrelor"), {type: "LEGE", number: "104", year: "2003"});
assert.deepEqual(extractLegalFingerprint("Lege 104 din 25 aprilie 2003"), {type: "LEGE", number: "104", year: "2003"});
assert.deepEqual(extractLegalFingerprint("OUG nr. 57/2019"), {type: "OUG", number: "57", year: "2019"});
assert.deepEqual(extractLegalFingerprint("Hotărârea Guvernului nr. 355/2007"), {type: "HG", number: "355", year: "2007"});
assert.deepEqual(extractLegalFingerprint("Ordin nr. 1226/2012"), {type: "ORDIN", number: "1226", year: "2012"});
// EU legislation
assert.deepEqual(extractLegalFingerprint("Directiva 2006/54/CE"), {type: "DIRECTIVA", number: "2006/54", year: "2006"});
assert.deepEqual(extractLegalFingerprint("Regulamentul (CE) nr. 561/2006"), {type: "REGULAMENT", number: "561", year: "2006"});
// Court decisions
assert.deepEqual(extractLegalFingerprint("Decizia nr. 405/2016"), {type: "DECIZIE", number: "405", year: "2016"});
// Non-legal titles
assert.equal(extractLegalFingerprint("Machine learning in forensic anthropology"), null);
// isLegalItem helper
assert(isLegalItem({itemType: "statute"}));
assert(isLegalItem({itemType: "webpage", title: "Legea nr. 104/2003"}));
assert(!isLegalItem({itemType: "journalArticle", title: "A review of ML"}));
```

**Step 2: Implement legal-fingerprint.js**

- `LEGAL_PATTERNS` array of regex objects (from spec section 3, Strat 4), each with a `type` label
- `extractLegalFingerprint(title)` — iterate patterns, return `{type, number, year}` or `null`
- `isLegalItem(item)` — check itemType in legal types set OR title matches any LEGAL_PATTERNS
- `legalFingerprintKey(fp)` — return string key like `"LEGE:104:2003"` for blocking

**Step 3: Commit**

```bash
git add zotdupe/src/legal-fingerprint.js zotdupe/tests/test-legal-fingerprint.js
git commit -m "feat: add legal fingerprinting for Romanian/EU legislation"
```

---

### Task 4: Blocking Strategy

**Files:**
- Create: `zotdupe/src/blocker.js`
- Create: `zotdupe/tests/test-blocker.js`

**Step 1: Write tests**

```javascript
// Item with DOI, title, year, author goes into multiple blocks
var item = {DOI: "10.1016/j.forsci.2023.01.001", title: "Machine learning in forensic pathology", date: "2023", creators: [{lastName: "Smith"}]};
var keys = generateBlockingKeys(item);
assert(keys.includes("doi:10.1016/j.forsci.2023.01.001"));
assert(keys.includes("title3:machine+learning+forensic|2023"));
assert(keys.includes("author:smith|2023"));

// Legal item gets fingerprint block key
var legalItem = {title: "Legea nr. 104/2003 privind manipularea cadavrelor", itemType: "statute"};
var legalKeys = generateBlockingKeys(legalItem);
assert(legalKeys.some(k => k.startsWith("legal:")));

// buildBlocks groups items correctly
var items = [item1, item2_sameDOI, item3_differentDOI];
var blocks = buildBlocks(items);
// item1 and item2 should be in the same DOI block
```

**Step 2: Implement blocker.js**

- `generateBlockingKeys(item)` — returns array of string keys:
  1. `"doi:" + normalizeDOI(item.DOI)` if DOI exists
  2. `"isbn:" + normalizeISBN(item.ISBN)` if ISBN exists
  3. `"title3:" + first3SignificantWords(normalizeTitle(item.title)) + "|" + year`
  4. `"legal:" + legalFingerprintKey(fp)` if legal fingerprint found
  5. `"author:" + normalizeAuthor(firstAuthor) + "|" + year` if author+year exist
- `buildBlocks(items)` — returns Map<string, Set<itemID>>. For each item, generate keys and add itemID to each key's set.
- `getCandidatePairs(blocks)` — returns Set of `[idA, idB]` pairs (deduplicated, sorted so idA < idB) from items sharing any block.

**Step 3: Commit**

```bash
git add zotdupe/src/blocker.js zotdupe/tests/test-blocker.js
git commit -m "feat: add blocking strategy for O(N*k) candidate pair generation"
```

---

### Task 5: Scanner — All 7 Layers

**Files:**
- Create: `zotdupe/src/scanner.js`
- Create: `zotdupe/tests/test-scanner.js`

**Step 1: Write tests for each layer**

Test each `scoreLayerN(itemA, itemB)` function individually:

```javascript
// Layer 1: Exact identifiers
assert(scoreLayer1({DOI: "10.1016/x"}, {DOI: "10.1016/x"}) === 1.0);
assert(scoreLayer1({DOI: "10.1016/x"}, {DOI: "10.1016/y"}) === 0.0);
assert(scoreLayer1({ISBN: "9783161484100"}, {ISBN: "978-3-16-148410-0"}) === 1.0);

// Layer 2: Normalized title + year
assert(scoreLayer2({title: "Machine Learning in Forensic", date: "2023"}, {title: "machine learning in forensic", date: "2023"}) === 0.95);
assert(scoreLayer2({title: "Machine Learning", date: "2023"}, {title: "machine learning", date: ""}) === 0.85);

// Layer 3: Authors
assert(scoreLayer3({creators: [{lastName: "Smith"}, {lastName: "Jones"}]}, {creators: [{lastName: "Smith"}, {lastName: "Jones"}]}) === 1.0);
assert(scoreLayer3({creators: [{lastName: "Smith"}]}, {creators: [{lastName: "Smith"}, {lastName: "Jones"}]}) === 0.5);

// Layer 4: Legal fingerprint
assert(scoreLayer4({title: "Legea nr. 104/2003 privind X"}, {title: "Lege 104 din 2003 privind Y"}) === 0.95);

// Layer 5: URL
assert(scoreLayer5({url: "https://example.com/path"}, {url: "http://www.example.com/path/"}) === 0.95);
assert(scoreLayer5({url: "https://example.com/path"}, {url: "https://example.com/other"}) === 0.80); // same domain

// Layer 6: Preprint <-> Journal
// itemA is preprint with arXiv URL, itemB is journalArticle with similar title + same first author
assert(scoreLayer6(preprintItem, journalItem) >= 0.80);

// Layer 7: Translations
assert(scoreLayer7({language: "en", creators: [...], date: "2023"}, {language: "ro", creators: [...], date: "2023"}) <= 0.70);
```

**Step 2: Implement scanner.js**

Each layer as a separate function returning 0.0-1.0:

- `scoreLayer1(a, b)` — compare DOI, PMID, PMCID, ISBN (all normalized). Any match → 1.0.
- `scoreLayer2(a, b)` — normalizeTitle both, compare. If identical + same year (±1) → 0.95. If identical + missing year → 0.85. If Jaccard ≥ 0.90 + same year → 0.85. Else 0.0.
- `scoreLayer3(a, b)` — normalize author last names, compute intersection ratio. If one has no creators → return null (skip layer).
- `scoreLayer4(a, b)` — extract legal fingerprints. If both exist and match → 0.95. If either is non-legal → return null (skip layer).
- `scoreLayer5(a, b)` — normalize URLs. Identical → 0.95. Same domain+path → 0.80. Different → 0.0.
- `scoreLayer6(a, b)` — check if one is preprint-like and other is journal-like. Check title Jaccard ≥ 0.80 + first author match. If yes → score based on similarity.
- `scoreLayer7(a, b)` — check different languages, same authors, same year, similar publisher. Max score 0.70.

Main function: `scanPair(itemA, itemB, options)` — runs all enabled layers, returns `{scores: {layer1: ..., layer7: ...}, matchType: "DOI identic" | "Fingerprint legislativ" | ...}`.

**Step 3: Commit**

```bash
git add zotdupe/src/scanner.js zotdupe/tests/test-scanner.js
git commit -m "feat: implement 7-layer semantic duplicate scanner"
```

---

### Task 6: Composite Scorer

**Files:**
- Create: `zotdupe/src/scorer.js`
- Create: `zotdupe/tests/test-scorer.js`

**Step 1: Write tests**

```javascript
// DOI match dominates
assert(computeScore({layer1: 1.0, layer2: 0.0, layer3: 0.5}) >= 0.95);
// Legal fingerprint dominates
assert(computeScore({layer1: 0.0, layer4: 0.95}) >= 0.85);
// Combined title+author+URL
var combined = computeScore({layer1: 0.0, layer2: 0.95, layer3: 1.0, layer5: 0.80});
assert(combined >= 0.80 && combined <= 0.95);
// Preprint detection
assert(computeScore({layer6: 0.85}) >= 0.70);
// Translation (low ceiling)
assert(computeScore({layer7: 0.70}) <= 0.70);
// Classify
assert(classify(0.97) === "sure");
assert(classify(0.85) === "probable");
assert(classify(0.65) === "possible");
assert(classify(0.40) === "none");
```

**Step 2: Implement scorer.js**

```javascript
function computeScore(layerScores) {
  // Formula from spec section 4
  const s1 = (layerScores.layer1 || 0) * 0.95;
  const s4 = (layerScores.layer4 || 0) * 0.90;
  const s6 = (layerScores.layer6 || 0) * 0.85;
  const s7 = (layerScores.layer7 || 0) * 0.60;

  // Combined strat 2+3+5 with normalization
  const s2 = layerScores.layer2 || 0;
  const s3 = layerScores.layer3 || 0;  // null = skipped
  const s5 = layerScores.layer5 || 0;
  const activeWeights = 0.50 + (layerScores.layer3 !== null ? 0.25 : 0) + (s5 > 0 ? 0.15 : 0) + 0.10;
  const combined = (s2 * 0.50 + (layerScores.layer3 || 0) * 0.25 + s5 * 0.15) / activeWeights;

  return Math.max(s1, s4, combined, s6, s7);
}

function classify(score, threshold) {
  // threshold: "strict" (0.90), "balanced" (0.75), "relaxed" (0.60)
  const minScore = {strict: 0.90, balanced: 0.75, relaxed: 0.60}[threshold];
  if (score < minScore) return "none";
  if (score >= 0.95) return "sure";
  if (score >= 0.80) return "probable";
  return "possible";
}
```

**Step 3: Commit**

```bash
git add zotdupe/src/scorer.js zotdupe/tests/test-scorer.js
git commit -m "feat: add composite scorer with configurable thresholds"
```

---

### Task 7: Canonical Item Selection

**Files:**
- Create: `zotdupe/src/canonical.js`
- Create: `zotdupe/tests/test-canonical.js`

**Step 1: Write tests**

```javascript
// journalArticle > preprint
assert(selectCanonical([journalItem, preprintItem]).id === journalItem.id);
// More complete metadata wins at same type
assert(selectCanonical([sparseItem, completeItem]).id === completeItem.id);
// DOI presence wins
assert(selectCanonical([itemNoDOI, itemWithDOI]).id === itemWithDOI.id);
// PDF attachment wins
assert(selectCanonical([itemNoPDF, itemWithPDF]).id === itemWithPDF.id);
// Earlier dateAdded as tiebreaker
assert(selectCanonical([laterItem, earlierItem]).id === earlierItem.id);
// Legal: statute > bill > webpage
assert(selectCanonical([webpageItem, statuteItem]).id === statuteItem.id);
```

**Step 2: Implement canonical.js**

```javascript
const TYPE_PRIORITY = {
  journalArticle: 10, preprint: 9, book: 8, bookSection: 7,
  conferencePaper: 7, report: 6, thesis: 6, statute: 5,
  bill: 4, regulation: 4, hearing: 3, webpage: 2, document: 1
};

function selectCanonical(items) {
  return items.sort((a, b) => {
    // 1. Type priority
    const typeDiff = (TYPE_PRIORITY[b.itemType] || 0) - (TYPE_PRIORITY[a.itemType] || 0);
    if (typeDiff !== 0) return typeDiff;
    // 2. Field completeness
    const fieldsDiff = countFields(b) - countFields(a);
    if (fieldsDiff !== 0) return fieldsDiff;
    // 3. DOI presence
    if (b.DOI && !a.DOI) return 1;
    if (a.DOI && !b.DOI) return -1;
    // 4. PDF attachment
    if (b.hasPDF && !a.hasPDF) return 1;
    if (a.hasPDF && !b.hasPDF) return -1;
    // 5. Earlier dateAdded
    return new Date(a.dateAdded) - new Date(b.dateAdded);
  })[0];
}
```

**Step 3: Commit**

```bash
git add zotdupe/src/canonical.js zotdupe/tests/test-canonical.js
git commit -m "feat: add canonical item selection with priority rules"
```

---

### Task 8: Cross-Type Merger

**Files:**
- Create: `zotdupe/src/merger.js`
- Create: `zotdupe/tests/test-merger.js`

**Step 1: Write tests**

```javascript
// Same-type merge delegates to Zotero.Items.merge
// Cross-type: saves lost fields to Extra before type change
// Tags are unioned
// Collections are unioned
// Attachments are all preserved
// Notes are all preserved
// Related items are unioned
// Extra field content is concatenated (unique lines)
// Preserved fields format: [ZotDupe:preserved] fieldName: value
```

**Step 2: Implement merger.js**

Key functions:

- `getFieldsForType(itemType)` — returns set of valid field names for a Zotero item type
- `findLostFields(item, newType)` — returns object of fields that exist on item but not on newType
- `preserveFieldsInExtra(item, lostFields)` — appends `[ZotDupe:preserved] key: value` lines to Extra
- `changeItemType(item, newType)` — save lost fields, change type, save
- `unionTags(masterItem, otherItems)` — collect all tags, add unique ones to master
- `unionCollections(masterItem, otherItems)` — add master to all collections of others
- `mergeItems(canonicalItem, duplicateItems)` — orchestrate:
  1. For each duplicate with different type: preserveFieldsInExtra, changeItemType
  2. Copy missing fields from duplicates to canonical
  3. unionTags, unionCollections
  4. Call `Zotero.Items.merge(canonicalItem, duplicateItems)` within a transaction
  5. Return merge log object

**Step 3: Commit**

```bash
git add zotdupe/src/merger.js zotdupe/tests/test-merger.js
git commit -m "feat: add cross-type merger with field preservation"
```

---

### Task 9: MinHash LSH (Optional Performance)

**Files:**
- Create: `zotdupe/src/utils/minhash.js`
- Create: `zotdupe/tests/test-minhash.js`

**Step 1: Write tests**

```javascript
// Shingle generation
assert.deepEqual(shingles("abcde", 3), new Set(["abc", "bcd", "cde"]));
// MinHash signature
var sig = minhashSignature(shingles("machine learning forensic", 3), 128);
assert(sig.length === 128);
// Similar strings should have similar signatures
var sig1 = minhashSignature(shingles("machine learning forensic pathology", 3), 128);
var sig2 = minhashSignature(shingles("machine learning in forensic pathology", 3), 128);
var similarity = signatureSimilarity(sig1, sig2);
assert(similarity >= 0.5);
// LSH banding
var bands = lshBands(sig1, 16, 8); // 16 bands, 8 rows each
assert(bands.length === 16);
```

**Step 2: Implement minhash.js**

- `shingles(text, k)` — generate k-character shingles as Set
- `minhashSignature(shingleSet, numHashes)` — generate MinHash signature using random hash functions (seeded for determinism)
- `signatureSimilarity(sig1, sig2)` — fraction of matching positions
- `lshBands(signature, b, r)` — split signature into b bands of r rows, hash each band
- `lshCandidates(items, b, r)` — build LSH index, return candidate pairs sharing any band

**Step 3: Commit**

```bash
git add zotdupe/src/utils/minhash.js zotdupe/tests/test-minhash.js
git commit -m "feat: add MinHash LSH for large library performance"
```

---

### Task 10: Main Orchestrator

**Files:**
- Create: `zotdupe/src/zotdupe.js`

**Step 1: Implement main orchestrator**

`ZotDupe` object that ties everything together:

```javascript
var ZotDupe = {
  async scan(options) {
    // 1. Get items (all library or selected collection)
    // 2. Build blocking index
    // 3. If MinHash enabled, add LSH candidates
    // 4. For each candidate pair: run scanner, compute score, classify
    // 5. Cluster overlapping pairs (union-find)
    // 6. For each cluster: select canonical
    // 7. Return clusters sorted by score desc
  },

  async mergeCluster(cluster, canonicalItemId) {
    // Delegate to merger.js
  },

  async mergeAllSure(clusters) {
    // Auto-merge all clusters with score >= 0.95
  },

  async markNonDuplicate(itemA, itemB) {
    // Add bidirectional relation "dc:replaces" with a special predicate
    // Store in prefs as excluded pairs
  },

  exportCSV(clusters, mergeLog) {
    // Generate CSV report
  }
};
```

Union-find for clustering:
```javascript
function clusterPairs(pairs) {
  // pairs: [{idA, idB, score, matchType}]
  // Returns: [{ids: Set, score: maxScore, matchType}]
  const parent = new Map();
  function find(x) { ... }
  function union(a, b) { ... }
  // Group by root, collect max score per cluster
}
```

**Step 2: Commit**

```bash
git add zotdupe/src/zotdupe.js
git commit -m "feat: add main orchestrator with scan, merge, and clustering"
```

---

### Task 11: UI — Config Dialog (Screen 1)

**Files:**
- Create: `zotdupe/src/ui/config-dialog.xhtml`
- Create: `zotdupe/src/ui/config-dialog.js`
- Create: `zotdupe/src/ui/config-dialog.css`

**Step 1: Create XHTML dialog**

560x420px dialog with:
- Header: ZotDupe logo + name + version
- Radio: "Entire library (N items)" / "Only collection: [dropdown]"
- Slider: Strict / Balanced / Relaxed with dynamic threshold text
- Expandable "Advanced options" section with 5 checkboxes (from spec section 9, Screen 1)
- Buttons: Cancel + Scan

**Step 2: Create dialog JS**

- On load: populate collection dropdown via `Zotero.Collections.getByLibrary()`
- Count items: `Zotero.Items.getAll()` for library, or `collection.getChildItems()` for collection
- Slider change: update threshold display text
- On Scan click: gather options, close dialog, open results with `ZotDupe.scan(options)`

**Step 3: Create CSS**

Style per spec: light mode, #FFFFFF content, #F7F7F8 panels, #5C6BC0 accent, 13px body, native OS font.

**Step 4: Commit**

```bash
git add zotdupe/src/ui/config-dialog.*
git commit -m "feat: add scan configuration dialog (Screen 1)"
```

---

### Task 12: UI — Results Panel (Screen 2)

**Files:**
- Create: `zotdupe/src/ui/results-panel.xhtml`
- Create: `zotdupe/src/ui/results-panel.js`
- Create: `zotdupe/src/ui/results-panel.css`

**Step 1: Create XHTML**

880x650px window with:
- Statistics bar (5 cards: items scanned, clusters, sure, probable, possible)
- Filter chips: All / Sure / Probable / Possible + search field
- Scrollable cluster list — each cluster as a card with colored left border
- Each cluster card: header (cluster #, score badge, match type, item count), item rows with radio for canonical selection, action buttons (Merge, Non-duplicate, Detail)
- Bottom bar: "Clusters resolved: 0/N", "Auto-merge all sure (N)" button, Close

**Step 2: Create results JS**

- Receive clusters data from scan
- Render cluster cards dynamically
- Filter/search functionality
- Radio selection for canonical override
- Merge button: call `ZotDupe.mergeCluster()`, update UI, increment resolved count
- Non-duplicate button: call `ZotDupe.markNonDuplicate()`, remove card
- Detail button: open merge preview dialog (Screen 3)
- Auto-merge all sure: iterate sure clusters, merge each, show progress

**Step 3: Create CSS**

Per spec: cluster cards with border-left colors (green #388E3C / amber #FF8F00 / red #EF5350), score badges, item type badges, DOI/PDF icons.

**Step 4: Commit**

```bash
git add zotdupe/src/ui/results-panel.*
git commit -m "feat: add results panel with cluster cards (Screen 2)"
```

---

### Task 13: UI — Merge Preview (Screen 3)

**Files:**
- Create: `zotdupe/src/ui/merge-preview.xhtml`
- Create: `zotdupe/src/ui/merge-preview.js`
- Create: `zotdupe/src/ui/merge-preview.css`

**Step 1: Create XHTML**

700x550px dialog with:
- Header: "Merge Preview — Cluster #N"
- Side-by-side field comparison table (3+ columns: Field, Master, Duplicate 1, Duplicate 2...)
- Color coding: white=identical, yellow=#FFF8E1=different, blue=#E3F2FD=will be copied
- Clickable cells to select which value to keep for differing fields
- Warning text for cross-type merges (amber)
- Buttons: Cancel + Execute Merge

**Step 2: Create JS**

- Receive cluster data + canonical selection
- Build field comparison: iterate all fields from both items, compare values
- Highlight differences
- Allow value selection by clicking
- Show preserved fields warning for cross-type
- Execute merge with selected values

**Step 3: Create CSS**

Diff-style colors per spec.

**Step 4: Commit**

```bash
git add zotdupe/src/ui/merge-preview.*
git commit -m "feat: add merge preview with field diff (Screen 3)"
```

---

### Task 14: UI — Report Dialog (Screen 4)

**Files:**
- Create: `zotdupe/src/ui/report-dialog.xhtml`
- Create: `zotdupe/src/ui/report-dialog.js`
- Create: `zotdupe/src/ui/report-dialog.css`

**Step 1: Create XHTML**

560x500px dialog with:
- Green checkmark + "Scan completed" header
- Summary card with key-value rows (items scanned, clusters detected, merges executed, marked non-duplicate, unresolved, fields saved in Extra, attachments preserved, unique tags, scan time, merge time)
- "Export CSV Report" button
- "Close" button

**Step 2: Create JS**

- Receive scan+merge statistics
- Populate summary values
- CSV export: generate CSV with columns (ClusterID, Score, MatchType, Action, Item1Title, Item1Type, Item2Title, Item2Type, ...), trigger download via file picker dialog

**Step 3: Commit**

```bash
git add zotdupe/src/ui/report-dialog.*
git commit -m "feat: add final report dialog with CSV export (Screen 4)"
```

---

### Task 15: Bootstrap Integration

**Files:**
- Modify: `zotdupe/bootstrap.js`

**Step 1: Wire everything together**

- In `startup()`: load all src/ scripts via loadSubScript in order (normalize → legal-fingerprint → blocker → scanner → scorer → canonical → merger → minhash → zotdupe)
- Register Tools menu item: "ZotDupe: Scan for Duplicates..."
- Menu click handler: open config-dialog.xhtml
- Register preference pane
- `onMainWindowLoad`: add menu item to window
- `onMainWindowUnload`: remove menu item, cleanup references
- `shutdown()`: remove all UI, unregister observers, null all references

**Step 2: Test manually**

Build .xpi: `cd zotdupe && zip -r ../zotdupe.xpi * -x "tests/*" -x "docs/*"`
Install in Zotero 7 via Tools → Add-ons → Install from file.

**Step 3: Commit**

```bash
git add zotdupe/bootstrap.js
git commit -m "feat: wire bootstrap.js with all modules and UI"
```

---

### Task 16: Non-Duplicate Marking & Persistence

**Files:**
- Modify: `zotdupe/src/zotdupe.js`

**Step 1: Implement non-duplicate persistence**

Store excluded pairs in Zotero preferences as JSON:
```javascript
// Save: extensions.zotdupe.excludedPairs = JSON array of [keyA, keyB] sorted
function markNonDuplicate(itemA, itemB) {
  const key = [itemA.key, itemB.key].sort().join(':');
  const excluded = getExcludedPairs();
  excluded.add(key);
  saveExcludedPairs(excluded);
}

function isExcludedPair(itemA, itemB) {
  const key = [itemA.key, itemB.key].sort().join(':');
  return getExcludedPairs().has(key);
}
```

Filter excluded pairs in scan results before returning clusters.

**Step 2: Commit**

```bash
git add zotdupe/src/zotdupe.js
git commit -m "feat: add non-duplicate marking with persistent exclusion"
```

---

### Task 17: Progress Indicator

**Files:**
- Modify: `zotdupe/src/zotdupe.js`
- Modify: `zotdupe/src/ui/config-dialog.js`

**Step 1: Add progress reporting**

During scan, report progress to UI:
- "Building index..." (blocking phase)
- "Comparing pairs: 150/2340..." (scanning phase)
- "Clustering results..." (clustering phase)

Use Zotero.ProgressWindow or custom progress bar in the results window.

**Step 2: Commit**

```bash
git add zotdupe/src/zotdupe.js zotdupe/src/ui/config-dialog.js
git commit -m "feat: add progress indicator during scan"
```

---

### Task 18: Packaging & Testing

**Files:**
- Create: `zotdupe/build.sh`
- Modify: `zotdupe/manifest.json` (final version check)

**Step 1: Create build script**

```bash
#!/bin/bash
cd "$(dirname "$0")"
rm -f ../zotdupe.xpi
zip -r ../zotdupe.xpi * \
  -x "tests/*" \
  -x "build.sh" \
  -x ".git/*" \
  -x "*.md"
echo "Built zotdupe.xpi"
```

**Step 2: Manual integration test checklist**

1. Install .xpi in Zotero 7
2. Open Tools → ZotDupe: Scan for Duplicates
3. Select "Entire library", Balanced threshold
4. Click Scan — verify progress indicator
5. Verify cluster cards appear with correct scores
6. Test Merge on a same-type duplicate
7. Test Merge on a cross-type duplicate (verify Extra field preservation)
8. Test Non-duplicate marking
9. Test Detail view (merge preview)
10. Test Auto-merge all sure
11. Verify report dialog shows correct statistics
12. Test CSV export
13. Re-scan — verify marked non-duplicates are excluded
14. Uninstall — verify clean removal

**Step 3: Commit**

```bash
git add zotdupe/build.sh
git commit -m "feat: add build script and finalize packaging"
```

---

## Execution Notes

- **No external dependencies** — everything is vanilla JS using Zotero's internal APIs
- **All UI is XHTML + HTML elements** — Zotero 7 supports HTML inside XHTML dialogs
- **Testing:** Unit tests in `tests/` can be run in Zotero's JavaScript console or via a test harness. Integration testing is manual via the plugin UI.
- **The spec document** (`docs/plans/2026-03-08-zotdupe-design.md`) is the source of truth for all algorithm details, regex patterns, score weights, UI layout, and color schemes.
