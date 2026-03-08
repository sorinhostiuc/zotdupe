/**
 * ZotDupe Scanner — All 7 Layers
 *
 * Provides layer-based scoring functions for comparing pairs of Zotero items
 * to detect duplicates. Each layer returns a score (0.0–1.0) or null if
 * the layer does not apply.
 *
 * Dependencies:
 *   - ZotDupe.Normalize (normalize.js)
 *   - ZotDupe.LegalFingerprint (legal-fingerprint.js)
 */

if (typeof ZotDupe === 'undefined') var ZotDupe = {};
if (!ZotDupe.Scanner) ZotDupe.Scanner = {};

var _N = ZotDupe.Normalize;
var _LF = ZotDupe.LegalFingerprint;

// ============================================================
// Helper: extract year as integer from item.date
// ============================================================
function _extractYear(item) {
    if (!item || !item.date) return null;
    var m = String(item.date).match(/(\d{4})/);
    return m ? parseInt(m[1], 10) : null;
}

// ============================================================
// Layer 1 — Exact Identifiers (DOI, PMID, PMCID, ISBN)
// ============================================================
ZotDupe.Scanner.scoreLayer1 = function (a, b) {
    var hasSomething = false;

    // DOI
    var doiA = __N.normalizeDOI(a.DOI);
    var doiB = __N.normalizeDOI(b.DOI);
    if (doiA && doiB) {
        hasSomething = true;
        if (doiA === doiB) return 1.0;
    }

    // PMID
    var pmidA = (a.PMID || '').trim();
    var pmidB = (b.PMID || '').trim();
    if (pmidA && pmidB) {
        hasSomething = true;
        if (pmidA === pmidB) return 1.0;
    }

    // PMCID
    var pmcidA = (a.PMCID || '').trim();
    var pmcidB = (b.PMCID || '').trim();
    if (pmcidA && pmcidB) {
        hasSomething = true;
        if (pmcidA === pmcidB) return 1.0;
    }

    // ISBN
    var isbnA = __N.normalizeISBN(a.ISBN);
    var isbnB = __N.normalizeISBN(b.ISBN);
    if (isbnA && isbnB) {
        hasSomething = true;
        if (isbnA === isbnB) return 1.0;
    }

    if (!hasSomething) return null;
    return 0.0;
};

// ============================================================
// Layer 2 — Normalized Title + Year
// ============================================================
ZotDupe.Scanner.scoreLayer2 = function (a, b) {
    var titleA = _N.normalizeTitle(a.title);
    var titleB = _N.normalizeTitle(b.title);
    if (!titleA || !titleB) return 0.0;

    var yearA = _extractYear(a);
    var yearB = _extractYear(b);
    var sameYear = (yearA !== null && yearB !== null && Math.abs(yearA - yearB) <= 1);
    var yearMissing = (yearA === null || yearB === null);

    if (titleA === titleB) {
        if (sameYear) return 0.95;
        if (yearMissing) return 0.85;
        return 0.70;
    }

    var jaccard = _N.jaccardSimilarity(titleA, titleB);

    if (jaccard >= 0.90) {
        if (sameYear) return 0.85;
        if (yearMissing) return 0.75;
    }

    if (jaccard >= 0.80 && sameYear) return 0.70;

    return 0.0;
};

// ============================================================
// Layer 3 — Authors
// ============================================================
ZotDupe.Scanner.scoreLayer3 = function (a, b) {
    var creatorsA = a.creators || [];
    var creatorsB = b.creators || [];
    if (creatorsA.length === 0 || creatorsB.length === 0) return null;

    var setA = {};
    var setB = {};
    var i;
    for (i = 0; i < creatorsA.length; i++) {
        var na = _N.normalizeAuthor(creatorsA[i]);
        if (na) setA[na] = true;
    }
    for (i = 0; i < creatorsB.length; i++) {
        var nb = _N.normalizeAuthor(creatorsB[i]);
        if (nb) setB[nb] = true;
    }

    var keysA = Object.keys(setA);
    var keysB = Object.keys(setB);
    if (keysA.length === 0 || keysB.length === 0) return null;

    var intersection = 0;
    for (i = 0; i < keysA.length; i++) {
        if (setB[keysA[i]]) intersection++;
    }

    var maxLen = Math.max(keysA.length, keysB.length);
    return intersection / maxLen;
};

// ============================================================
// Layer 4 — Legal Fingerprint
// ============================================================
ZotDupe.Scanner.scoreLayer4 = function (a, b) {
    var fpA = _LF.extractLegalFingerprint(a.title);
    var fpB = _LF.extractLegalFingerprint(b.title);
    if (!fpA || !fpB) return null;

    if (fpA.type === fpB.type && fpA.number === fpB.number && fpA.year === fpB.year) {
        return 0.95;
    }
    if (fpA.type === fpB.type) return 0.0;
    return 0.0;
};

// ============================================================
// Layer 5 — URL
// ============================================================
ZotDupe.Scanner.scoreLayer5 = function (a, b) {
    if (!a.url || !b.url) return null;

    var urlA = _N.normalizeURL(a.url);
    var urlB = _N.normalizeURL(b.url);
    if (!urlA || !urlB) return null;

    if (urlA === urlB) return 0.95;

    // Compare domain (everything before the first /)
    var domainA = urlA.split('/')[0];
    var domainB = urlB.split('/')[0];
    if (domainA === domainB) return 0.80;

    return 0.0;
};

// ============================================================
// Layer 6 — Preprint ↔ Journal Article
// ============================================================
var PREPRINT_DOMAINS = ['arxiv.org', 'biorxiv.org', 'medrxiv.org', 'ssrn.com'];

function _isPreprintLike(item) {
    if (item.itemType === 'preprint') return true;
    if (item.url) {
        var u = item.url.toLowerCase();
        for (var i = 0; i < PREPRINT_DOMAINS.length; i++) {
            if (u.indexOf(PREPRINT_DOMAINS[i]) !== -1) return true;
        }
    }
    return false;
}

function _isJournalLike(item) {
    return item.itemType === 'journalArticle';
}

ZotDupe.Scanner.scoreLayer6 = function (a, b) {
    var pairOk = (_isPreprintLike(a) && _isJournalLike(b)) ||
                 (_isPreprintLike(b) && _isJournalLike(a));
    if (!pairOk) return null;

    var titleA = _N.normalizeTitle(a.title);
    var titleB = _N.normalizeTitle(b.title);
    var jaccard = _N.jaccardSimilarity(titleA, titleB);

    if (jaccard < 0.80) return 0.0;

    // Compare first author
    var firstA = (a.creators && a.creators.length > 0) ? _N.normalizeAuthor(a.creators[0]) : '';
    var firstB = (b.creators && b.creators.length > 0) ? _N.normalizeAuthor(b.creators[0]) : '';

    if (firstA && firstB && firstA === firstB) return 0.90;
    return 0.70;
};

// ============================================================
// Layer 7 — Translations
// ============================================================
ZotDupe.Scanner.scoreLayer7 = function (a, b) {
    if (!a.language || !b.language) return null;
    if (a.language.trim().toLowerCase() === b.language.trim().toLowerCase()) return null;

    var score = 0.0;

    // Authors match (reuse layer 3)
    var authorScore = ZotDupe.Scanner.scoreLayer3(a, b);
    if (authorScore !== null && authorScore >= 0.8) score += 0.30;

    // Same year
    var yearA = _extractYear(a);
    var yearB = _extractYear(b);
    if (yearA !== null && yearB !== null && yearA === yearB) score += 0.20;

    // Same publisher/journal
    var pubA = (a.publicationTitle || '').trim().toLowerCase();
    var pubB = (b.publicationTitle || '').trim().toLowerCase();
    if (pubA && pubB && pubA === pubB) score += 0.20;

    // Cap at 0.70
    if (score > 0.70) score = 0.70;
    if (score < 0.30) return 0.0;
    return score;
};

// ============================================================
// Main: scanPair
// ============================================================
/**
 * Compare two items across all enabled layers.
 *
 * @param {object} itemA - Plain Zotero item object
 * @param {object} itemB - Plain Zotero item object
 * @param {object} [options] - Flags to enable/disable layers
 * @param {boolean} [options.enableLegalFingerprint=true]
 * @param {boolean} [options.enablePreprintDetection=true]
 * @param {boolean} [options.enableTranslationDetection=true]
 * @param {boolean} [options.enableCrossType=true]
 * @returns {{scores: object, matchType: string}}
 */
ZotDupe.Scanner.scanPair = function (itemA, itemB, options) {
    var opts = options || {};
    var enableLegal = opts.enableLegalFingerprint !== false;
    var enablePreprint = opts.enablePreprintDetection !== false;
    var enableTranslation = opts.enableTranslationDetection !== false;
    // enableCrossType reserved for future use

    var scores = {
        layer1: null,
        layer2: null,
        layer3: null,
        layer4: null,
        layer5: null,
        layer6: null,
        layer7: null
    };

    // Always run layers 1, 2, 3, 5
    scores.layer1 = ZotDupe.Scanner.scoreLayer1(itemA, itemB);
    scores.layer2 = ZotDupe.Scanner.scoreLayer2(itemA, itemB);
    scores.layer3 = ZotDupe.Scanner.scoreLayer3(itemA, itemB);
    scores.layer5 = ZotDupe.Scanner.scoreLayer5(itemA, itemB);

    // Conditional layers
    if (enableLegal) {
        scores.layer4 = ZotDupe.Scanner.scoreLayer4(itemA, itemB);
    }
    if (enablePreprint) {
        scores.layer6 = ZotDupe.Scanner.scoreLayer6(itemA, itemB);
    }
    if (enableTranslation) {
        scores.layer7 = ZotDupe.Scanner.scoreLayer7(itemA, itemB);
    }

    // Determine matchType from highest-scoring layer (excluding layer 3)
    var matchType = '';
    var bestScore = 0;

    // Layer 1 — identify which identifier matched
    if (scores.layer1 !== null && scores.layer1 > bestScore) {
        bestScore = scores.layer1;
        // Determine specific identifier type
        var doiA = _N.normalizeDOI(itemA.DOI);
        var doiB = _N.normalizeDOI(itemB.DOI);
        if (doiA && doiB && doiA === doiB) {
            matchType = 'DOI identic';
        } else {
            var isbnA = _N.normalizeISBN(itemA.ISBN);
            var isbnB = _N.normalizeISBN(itemB.ISBN);
            var pmidA = (itemA.PMID || '').trim();
            var pmidB = (itemB.PMID || '').trim();
            if (pmidA && pmidB && pmidA === pmidB) {
                matchType = 'PMID identic';
            } else if (isbnA && isbnB && isbnA === isbnB) {
                matchType = 'ISBN identic';
            } else {
                var pmcidA = (itemA.PMCID || '').trim();
                var pmcidB = (itemB.PMCID || '').trim();
                if (pmcidA && pmcidB && pmcidA === pmcidB) {
                    matchType = 'PMID identic';
                } else {
                    matchType = 'DOI identic';
                }
            }
        }
    }

    if (scores.layer2 !== null && scores.layer2 > bestScore) {
        bestScore = scores.layer2;
        matchType = 'Titlu similar + an';
    }

    // Layer 3 is never primary

    if (scores.layer4 !== null && scores.layer4 > bestScore) {
        bestScore = scores.layer4;
        matchType = 'Fingerprint legislativ';
    }

    if (scores.layer5 !== null && scores.layer5 > bestScore) {
        bestScore = scores.layer5;
        matchType = 'URL identic';
    }

    if (scores.layer6 !== null && scores.layer6 > bestScore) {
        bestScore = scores.layer6;
        matchType = 'Preprint ↔ articol';
    }

    if (scores.layer7 !== null && scores.layer7 > bestScore) {
        bestScore = scores.layer7;
        matchType = 'Posibilă traducere';
    }

    return {
        scores: scores,
        matchType: matchType
    };
};
