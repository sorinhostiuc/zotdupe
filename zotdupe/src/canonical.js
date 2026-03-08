/**
 * ZotDupe Canonical Item Selection
 *
 * Given a group of duplicate items, selects the best "canonical" item
 * to keep. Selection criteria (in priority order):
 *   1. Item type priority (journalArticle > preprint > ... > document)
 *   2. Field completeness (more non-empty fields wins)
 *   3. DOI presence
 *   4. PDF attachment presence
 *   5. Earlier dateAdded (older record wins as tiebreaker)
 */

if (typeof ZotDupe === 'undefined') var ZotDupe = {};
if (!ZotDupe.Canonical) ZotDupe.Canonical = {};

// ============================================================
// TYPE_PRIORITY — higher number = more preferred
// ============================================================
var TYPE_PRIORITY = {
    journalArticle: 10,
    preprint: 9,
    book: 8,
    bookSection: 7,
    conferencePaper: 7,
    report: 6,
    thesis: 6,
    statute: 5,
    bill: 4,
    regulation: 4,
    hearing: 3,
    webpage: 2,
    document: 1
};

ZotDupe.Canonical.TYPE_PRIORITY = TYPE_PRIORITY;

// ============================================================
// countFields(item) — count non-empty, non-null string fields
// ============================================================
/**
 * Count non-empty, non-null fields on a plain item object.
 * Excludes 'id', 'itemType', and 'creators'.
 * Only counts string fields that have length > 0.
 *
 * @param {Object} item - Plain item object
 * @returns {number} Count of non-empty string fields
 */
function countFields(item) {
    if (!item || typeof item !== 'object') return 0;
    var SKIP = { id: true, itemType: true, creators: true };
    var count = 0;
    for (var key in item) {
        if (!item.hasOwnProperty(key)) continue;
        if (SKIP[key]) continue;
        var val = item[key];
        if (typeof val === 'string' && val.length > 0) {
            count++;
        }
    }
    return count;
}

ZotDupe.Canonical.countFields = countFields;

// ============================================================
// selectCanonical(items) — pick the best item from a group
// ============================================================
/**
 * Select the best canonical item from an array of plain item objects.
 *
 * Selection criteria in order of priority:
 *   1. Type priority (higher TYPE_PRIORITY wins)
 *   2. Field completeness (more non-empty fields wins)
 *   3. DOI presence (item with DOI wins)
 *   4. Has PDF attachment (item.hasPDF === true wins)
 *   5. Earlier dateAdded (compared as dates, earlier wins)
 *
 * @param {Array} items - Array of plain item objects
 * @returns {Object|null} The best canonical item, or null if empty
 */
function selectCanonical(items) {
    if (!items || items.length === 0) return null;
    if (items.length === 1) return items[0];

    var best = items[0];
    for (var i = 1; i < items.length; i++) {
        var candidate = items[i];

        // 1. Type priority
        var bestTypePri = TYPE_PRIORITY[best.itemType] || 0;
        var candTypePri = TYPE_PRIORITY[candidate.itemType] || 0;
        if (candTypePri > bestTypePri) { best = candidate; continue; }
        if (candTypePri < bestTypePri) continue;

        // 2. Field completeness
        var bestFields = countFields(best);
        var candFields = countFields(candidate);
        if (candFields > bestFields) { best = candidate; continue; }
        if (candFields < bestFields) continue;

        // 3. DOI presence
        var bestDOI = !!(best.DOI && best.DOI.length > 0);
        var candDOI = !!(candidate.DOI && candidate.DOI.length > 0);
        if (candDOI && !bestDOI) { best = candidate; continue; }
        if (!candDOI && bestDOI) continue;

        // 4. PDF attachment
        var bestPDF = best.hasPDF === true;
        var candPDF = candidate.hasPDF === true;
        if (candPDF && !bestPDF) { best = candidate; continue; }
        if (!candPDF && bestPDF) continue;

        // 5. Earlier dateAdded
        if (candidate.dateAdded && best.dateAdded) {
            var candDate = new Date(candidate.dateAdded);
            var bestDate = new Date(best.dateAdded);
            if (candDate < bestDate) { best = candidate; continue; }
        }
    }

    return best;
}

ZotDupe.Canonical.selectCanonical = selectCanonical;
