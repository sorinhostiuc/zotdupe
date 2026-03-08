/**
 * ZotDupe Normalization Utilities
 *
 * Provides text normalization and similarity functions used for
 * detecting duplicate references in Zotero 7+.
 */

if (typeof ZotDupe === 'undefined') var ZotDupe = {};
if (!ZotDupe.Normalize) ZotDupe.Normalize = {};

/**
 * Remove diacritics from a string using Unicode NFKD decomposition.
 * Strips combining marks so that e.g. ă->a, ș->s, ț->t, î->i, â->a.
 * @param {string} str
 * @returns {string}
 */
ZotDupe.Normalize.removeDiacritics = function (str) {
    if (!str) return '';
    // NFKD decomposes characters; then strip combining marks (Unicode category M)
    // Strip all combining marks: Combining Diacritical Marks (0300-036F),
    // Combining Diacritical Marks Extended (1AB0-1AFF),
    // Combining Diacritical Marks Supplement (1DC0-1DFF),
    // Combining Half Marks (FE20-FE2F)
    return str.normalize('NFKD').replace(/[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\ufe20-\ufe2f]/g, '');
};

/**
 * Normalize a bibliographic title for comparison.
 * Pipeline: lowercase -> removeDiacritics -> strip punctuation ->
 *           collapse spaces -> remove leading articles -> remove legal noise -> trim
 * @param {string} title
 * @returns {string}
 */
ZotDupe.Normalize.normalizeTitle = function (title) {
    if (!title) return '';
    var s = title.toLowerCase();
    s = ZotDupe.Normalize.removeDiacritics(s);
    // Strip everything except alphanumeric and spaces
    s = s.replace(/[^a-z0-9\s]/g, '');
    // Collapse multiple spaces
    s = s.replace(/\s+/g, ' ');
    s = s.trim();
    // Remove leading articles (must be followed by a space)
    s = s.replace(/^(the|an|a|un|o|la|le|les)\s+/, '');
    // Remove Romanian / legal noise words anywhere in the string
    var noisePatterns = [
        'referitor la',
        'pentru modificarea',
        'cu privire la',
        'privind'
    ];
    for (var i = 0; i < noisePatterns.length; i++) {
        // Use a loop with indexOf to avoid regex special-char issues
        var idx;
        while ((idx = s.indexOf(noisePatterns[i])) !== -1) {
            s = s.substring(0, idx) + s.substring(idx + noisePatterns[i].length);
        }
    }
    // Collapse spaces again after removals and trim
    s = s.replace(/\s+/g, ' ').trim();
    return s;
};

/**
 * Normalize a DOI string: lowercase, strip common prefixes, trim.
 * @param {string} doi
 * @returns {string}
 */
ZotDupe.Normalize.normalizeDOI = function (doi) {
    if (!doi) return '';
    var s = doi.trim().toLowerCase();
    // Strip URL-style prefixes
    var prefixes = [
        'https://doi.org/',
        'http://doi.org/',
        'https://dx.doi.org/',
        'http://dx.doi.org/',
        'doi:'
    ];
    for (var i = 0; i < prefixes.length; i++) {
        if (s.indexOf(prefixes[i]) === 0) {
            s = s.substring(prefixes[i].length);
            break;
        }
    }
    return s.trim();
};

/**
 * Normalize an ISBN: strip hyphens/spaces, convert ISBN-10 to ISBN-13.
 * @param {string} isbn
 * @returns {string}
 */
ZotDupe.Normalize.normalizeISBN = function (isbn) {
    if (!isbn) return '';
    var s = isbn.replace(/[-\s]/g, '');
    // ISBN-10 to ISBN-13 conversion
    if (s.length === 10) {
        // Prefix with 978, drop old check digit, recalculate
        var base = '978' + s.substring(0, 9);
        var sum = 0;
        for (var i = 0; i < 12; i++) {
            var digit = parseInt(base[i], 10);
            sum += (i % 2 === 0) ? digit : digit * 3;
        }
        var check = (10 - (sum % 10)) % 10;
        s = base + check.toString();
    }
    return s;
};

/**
 * Normalize a URL: strip protocol, www., trailing slash, query params, fragments.
 * @param {string} url
 * @returns {string}
 */
ZotDupe.Normalize.normalizeURL = function (url) {
    if (!url) return '';
    var s = url.trim();
    // Strip protocol
    s = s.replace(/^https?:\/\//, '');
    // Strip www.
    s = s.replace(/^www\./, '');
    // Strip fragment
    var hashIdx = s.indexOf('#');
    if (hashIdx !== -1) s = s.substring(0, hashIdx);
    // Strip query params
    var qIdx = s.indexOf('?');
    if (qIdx !== -1) s = s.substring(0, qIdx);
    // Strip trailing slash
    s = s.replace(/\/+$/, '');
    return s;
};

/**
 * Normalize a creator's last name: lowercase, remove diacritics.
 * @param {{firstName: string, lastName: string}} creator
 * @returns {string}
 */
ZotDupe.Normalize.normalizeAuthor = function (creator) {
    if (!creator || !creator.lastName) return '';
    var s = creator.lastName.toLowerCase();
    return ZotDupe.Normalize.removeDiacritics(s);
};

/**
 * Jaccard similarity between two strings based on word sets.
 * Returns |intersection| / |union|.  Both empty -> 1.0.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
ZotDupe.Normalize.jaccardSimilarity = function (a, b) {
    var wordsA = (a || '').split(/\s+/).filter(function (w) { return w.length > 0; });
    var wordsB = (b || '').split(/\s+/).filter(function (w) { return w.length > 0; });
    if (wordsA.length === 0 && wordsB.length === 0) return 1.0;

    var setA = {};
    var setB = {};
    var i;
    for (i = 0; i < wordsA.length; i++) setA[wordsA[i]] = true;
    for (i = 0; i < wordsB.length; i++) setB[wordsB[i]] = true;

    var intersection = 0;
    var union = {};
    for (var key in setA) {
        union[key] = true;
        if (setB[key]) intersection++;
    }
    for (var key2 in setB) {
        union[key2] = true;
    }
    var unionSize = Object.keys(union).length;
    if (unionSize === 0) return 1.0;
    return intersection / unionSize;
};

/**
 * Standard Levenshtein edit distance (dynamic programming).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
ZotDupe.Normalize.levenshteinDistance = function (a, b) {
    a = a || '';
    b = b || '';
    var m = a.length;
    var n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    // Use single-row optimization
    var prev = new Array(n + 1);
    var curr = new Array(n + 1);
    var i, j;
    for (j = 0; j <= n; j++) prev[j] = j;

    for (i = 1; i <= m; i++) {
        curr[0] = i;
        for (j = 1; j <= n; j++) {
            var cost = (a[i - 1] === b[j - 1]) ? 0 : 1;
            curr[j] = Math.min(
                prev[j] + 1,       // deletion
                curr[j - 1] + 1,   // insertion
                prev[j - 1] + cost  // substitution
            );
        }
        var tmp = prev;
        prev = curr;
        curr = tmp;
    }
    return prev[n];
};

/**
 * Normalized Levenshtein similarity: 1 - (distance / max(len_a, len_b)).
 * Both empty -> 1.0.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
ZotDupe.Normalize.normalizedLevenshtein = function (a, b) {
    a = a || '';
    b = b || '';
    if (a.length === 0 && b.length === 0) return 1.0;
    var dist = ZotDupe.Normalize.levenshteinDistance(a, b);
    var maxLen = Math.max(a.length, b.length);
    return 1 - (dist / maxLen);
};
