/**
 * ZotDupe Blocking Strategy
 *
 * Generates blocking keys for candidate pair selection,
 * dramatically reducing the number of pairwise comparisons
 * needed for duplicate detection in Zotero 7+.
 *
 * Dependencies:
 *   - ZotDupe.Normalize (normalize.js)
 *   - ZotDupe.LegalFingerprint (legal-fingerprint.js)
 */

if (typeof ZotDupe === 'undefined') var ZotDupe = {};
if (!ZotDupe.Blocker) ZotDupe.Blocker = {};

/**
 * Extract a 4-digit year from a date string.
 * Returns the first 4-digit number found, or empty string.
 * @param {string} dateStr
 * @returns {string}
 */
ZotDupe.Blocker.extractYear = function (dateStr) {
    if (!dateStr) return '';
    var match = dateStr.match(/(\d{4})/);
    return match ? match[1] : '';
};

/**
 * Return the first 3 significant words from a normalized title,
 * joined with "+". If fewer than 3 words, use what's available.
 * @param {string} normalizedTitle - already normalized via ZotDupe.Normalize.normalizeTitle
 * @returns {string}
 */
ZotDupe.Blocker.first3SignificantWords = function (normalizedTitle) {
    if (!normalizedTitle) return '';
    var words = normalizedTitle.split(/\s+/).filter(function (w) { return w.length > 0; });
    return words.slice(0, 3).join('+');
};

/**
 * Generate an array of blocking key strings for a given item.
 * An item can produce multiple keys across different key types.
 *
 * @param {{id: *, title: string, DOI: string, ISBN: string, date: string, creators: Array, itemType: string}} item
 * @returns {string[]}
 */
ZotDupe.Blocker.generateBlockingKeys = function (item) {
    if (!item) return [];
    var keys = [];
    var year = ZotDupe.Blocker.extractYear(item.date);

    // DOI key
    if (item.DOI) {
        var normDOI = ZotDupe.Normalize.normalizeDOI(item.DOI);
        if (normDOI) {
            keys.push('doi:' + normDOI);
        }
    }

    // ISBN key
    if (item.ISBN) {
        var normISBN = ZotDupe.Normalize.normalizeISBN(item.ISBN);
        if (normISBN) {
            keys.push('isbn:' + normISBN);
        }
    }

    // Title-based key (first 3 significant words + year)
    if (item.title) {
        var normTitle = ZotDupe.Normalize.normalizeTitle(item.title);
        var titlePart = ZotDupe.Blocker.first3SignificantWords(normTitle);
        if (titlePart) {
            var titleKey = 'title3:' + titlePart;
            if (year) {
                titleKey += '|' + year;
            }
            keys.push(titleKey);
        }
    }

    // Legal fingerprint key
    if (item.title) {
        var fp = ZotDupe.LegalFingerprint.extractLegalFingerprint(item.title);
        if (fp) {
            keys.push('legal:' + ZotDupe.LegalFingerprint.legalFingerprintKey(fp));
        }
    }

    // Author + year key
    if (item.creators && item.creators.length > 0 && year) {
        var firstCreator = item.creators[0];
        var normAuthor = ZotDupe.Normalize.normalizeAuthor(firstCreator);
        if (normAuthor) {
            keys.push('author:' + normAuthor + '|' + year);
        }
    }

    return keys;
};

/**
 * Build blocking groups from an array of items.
 * Returns a Map where key = blocking key string, value = Set of item IDs.
 *
 * @param {Array<{id: *, title: string, DOI: string, ISBN: string, date: string, creators: Array, itemType: string}>} items
 * @returns {Map<string, Set>}
 */
ZotDupe.Blocker.buildBlocks = function (items) {
    var blocks = new Map();
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var keys = ZotDupe.Blocker.generateBlockingKeys(item);
        for (var j = 0; j < keys.length; j++) {
            var key = keys[j];
            if (!blocks.has(key)) {
                blocks.set(key, new Set());
            }
            blocks.get(key).add(item.id);
        }
    }
    return blocks;
};

/**
 * Generate deduplicated candidate pairs from blocking groups.
 * For each block with 2+ items, generates all pairs.
 * Pairs are deduplicated by sorting IDs (smaller first) and
 * tracking seen pairs via a Set of "idA:idB" strings.
 *
 * @param {Map<string, Set>} blocks - output from buildBlocks
 * @returns {Array<[*, *]>}
 */
ZotDupe.Blocker.getCandidatePairs = function (blocks) {
    var seen = new Set();
    var pairs = [];
    blocks.forEach(function (idSet) {
        if (idSet.size < 2) return;
        var ids = Array.from(idSet);
        for (var i = 0; i < ids.length; i++) {
            for (var j = i + 1; j < ids.length; j++) {
                var a = ids[i];
                var b = ids[j];
                // Sort so smaller ID is first for consistent dedup
                if (String(a) > String(b)) {
                    var tmp = a;
                    a = b;
                    b = tmp;
                }
                var pairKey = String(a) + ':' + String(b);
                if (!seen.has(pairKey)) {
                    seen.add(pairKey);
                    pairs.push([a, b]);
                }
            }
        }
    });
    return pairs;
};
