/**
 * ZotDupe Legal Fingerprinting
 *
 * Identifies and fingerprints Romanian and EU legal documents
 * for precise duplicate detection in Zotero 7+.
 */

if (typeof ZotDupe === 'undefined') var ZotDupe = {};
if (!ZotDupe.LegalFingerprint) ZotDupe.LegalFingerprint = {};

/**
 * Patterns for identifying legal document types.
 * Each entry has a `type` string and a `regex` with capture groups
 * for the document number and year.
 *
 * The "din" separator is handled flexibly: it allows optional
 * intervening text (e.g. "din 25 aprilie 2003") between "din"
 * and the 4-digit year.
 */
var LEGAL_PATTERNS = [
    {type: "LEGE", regex: /(?:legea?|lege)\s*(?:nr\.?\s*)?(\d+)\s*(?:[\/]|\s+din\s+.*?)\s*(\d{4})/i},
    {type: "OUG", regex: /(?:oug|ordonan[tț][aă]\s+de\s+urgen[tț][aă])\s*(?:nr\.?\s*)?(\d+)\s*(?:[\/]|\s+din\s+.*?)\s*(\d{4})/i},
    {type: "HG", regex: /(?:hg|hot[aă]r[aâ]rea?\s+guvernului)\s*(?:nr\.?\s*)?(\d+)\s*(?:[\/]|\s+din\s+.*?)\s*(\d{4})/i},
    {type: "ORDIN", regex: /(?:ordin|ordinul)\s*(?:nr\.?\s*)?(\d+)\s*(?:[\/]|\s+din\s+.*?)\s*(\d{4})/i},
    {type: "DIRECTIVA", regex: /(?:directiva?)\s*(?:nr\.?\s*)?(\d+)\s*\/\s*(\d+)\s*\/?\s*(?:ce|ue|cee)?/i},
    {type: "REGULAMENT", regex: /(?:regulamentul?)\s*\(?\s*(?:ce|ue|cee)?\s*\)?\s*(?:nr\.?\s*)?(\d+)\s*\/\s*(\d+)/i},
    {type: "DECIZIE", regex: /(?:decizia?)\s*(?:nr\.?\s*)?(\d+)\s*(?:[\/]|\s+din\s+.*?)\s*(\d{4})/i}
];

/**
 * Extract a legal fingerprint from a title string.
 * Returns {type, number, year} on match, or null if no legal pattern found.
 *
 * For DIRECTIVA, the "number" combines both capture groups as "GROUP1/GROUP2"
 * and year is GROUP1 (EU directive notation: "2006/54/CE" -> number="2006/54", year="2006").
 *
 * @param {string} title
 * @returns {{type: string, number: string, year: string}|null}
 */
ZotDupe.LegalFingerprint.extractLegalFingerprint = function (title) {
    if (!title) return null;
    for (var i = 0; i < LEGAL_PATTERNS.length; i++) {
        var pattern = LEGAL_PATTERNS[i];
        var match = title.match(pattern.regex);
        if (match) {
            if (pattern.type === "DIRECTIVA") {
                return {
                    type: pattern.type,
                    number: match[1] + "/" + match[2],
                    year: match[1]
                };
            }
            return {
                type: pattern.type,
                number: match[1],
                year: match[2]
            };
        }
    }
    return null;
};

/**
 * Zotero item types that are inherently legal.
 */
var LEGAL_ITEM_TYPES = ['statute', 'bill', 'hearing', 'regulation', 'case'];

/**
 * Check whether a Zotero item is a legal document.
 * Returns true if the item type is a legal type, or if the title
 * matches any legal pattern.
 *
 * @param {{itemType: string, title: string}} item
 * @returns {boolean}
 */
ZotDupe.LegalFingerprint.isLegalItem = function (item) {
    if (!item) return false;
    if (item.itemType && LEGAL_ITEM_TYPES.indexOf(item.itemType) !== -1) {
        return true;
    }
    return ZotDupe.LegalFingerprint.extractLegalFingerprint(item.title) !== null;
};

/**
 * Build a blocking key string from a legal fingerprint.
 * Format: "TYPE:NUMBER:YEAR"
 *
 * @param {{type: string, number: string, year: string}} fp
 * @returns {string}
 */
ZotDupe.LegalFingerprint.legalFingerprintKey = function (fp) {
    return fp.type + ":" + fp.number + ":" + fp.year;
};
