/**
 * ZotDupe Cross-Type Merger
 *
 * Functions for merging duplicate items, including cross-type merges.
 * When merging items of different types, fields that don't exist on
 * the target type are preserved in the Extra field with a
 * [ZotDupe:preserved] prefix for traceability.
 *
 * This module works with plain objects for testability — actual
 * Zotero API calls (item.setField, item.saveTx, Zotero.Items.merge)
 * are done by the orchestrator.
 */

if (typeof ZotDupe === 'undefined') var ZotDupe = {};
if (!ZotDupe.Merger) ZotDupe.Merger = {};

// ============================================================
// FIELDS_BY_TYPE — valid field names per Zotero item type
// ============================================================
var FIELDS_BY_TYPE = {
    journalArticle: [
        'title', 'abstractNote', 'publicationTitle', 'volume', 'issue',
        'pages', 'date', 'DOI', 'ISSN', 'url', 'language', 'shortTitle',
        'extra', 'rights', 'archive', 'archiveLocation', 'callNumber',
        'libraryCatalog', 'accessDate'
    ],
    book: [
        'title', 'abstractNote', 'publisher', 'place', 'date', 'ISBN',
        'url', 'numPages', 'edition', 'series', 'seriesNumber',
        'language', 'shortTitle', 'extra'
    ],
    bookSection: [
        'title', 'abstractNote', 'bookTitle', 'publisher', 'place',
        'date', 'ISBN', 'url', 'pages', 'volume', 'edition', 'series',
        'seriesNumber', 'language', 'shortTitle', 'extra'
    ],
    conferencePaper: [
        'title', 'abstractNote', 'proceedingsTitle', 'conferenceName',
        'place', 'date', 'DOI', 'ISBN', 'url', 'pages', 'volume',
        'publisher', 'language', 'shortTitle', 'extra'
    ],
    thesis: [
        'title', 'abstractNote', 'thesisType', 'university', 'place',
        'date', 'url', 'numPages', 'language', 'shortTitle', 'extra',
        'archive', 'archiveLocation', 'callNumber', 'libraryCatalog',
        'accessDate', 'rights'
    ],
    report: [
        'title', 'abstractNote', 'reportNumber', 'reportType',
        'institution', 'place', 'date', 'url', 'pages', 'language',
        'shortTitle', 'extra', 'archive', 'archiveLocation',
        'callNumber', 'libraryCatalog', 'accessDate', 'rights'
    ],
    preprint: [
        'title', 'abstractNote', 'repository', 'archiveID', 'date',
        'DOI', 'url', 'language', 'shortTitle', 'extra'
    ],
    webpage: [
        'title', 'abstractNote', 'websiteTitle', 'websiteType', 'date',
        'url', 'language', 'shortTitle', 'extra', 'accessDate'
    ],
    document: [
        'title', 'abstractNote', 'publisher', 'date', 'url', 'language',
        'shortTitle', 'extra', 'archive', 'archiveLocation',
        'callNumber', 'libraryCatalog', 'accessDate', 'rights'
    ],
    statute: [
        'title', 'abstractNote', 'code', 'codeNumber', 'dateEnacted',
        'pages', 'section', 'session', 'url', 'language', 'shortTitle',
        'extra', 'rights'
    ],
    bill: [
        'title', 'abstractNote', 'billNumber', 'code', 'codePages',
        'codeVolume', 'date', 'legislativeBody', 'session', 'url',
        'language', 'shortTitle', 'extra', 'rights'
    ],
    regulation: [
        'title', 'abstractNote', 'regulatoryBody', 'regulationType',
        'code', 'codeNumber', 'dateEnacted', 'pages', 'section', 'url',
        'language', 'shortTitle', 'extra', 'rights'
    ],
    'case': [
        'title', 'abstractNote', 'caseName', 'court', 'dateDecided',
        'docketNumber', 'reporter', 'reporterVolume', 'firstPage',
        'url', 'language', 'shortTitle', 'extra', 'rights'
    ],
    hearing: [
        'title', 'abstractNote', 'committee', 'legislativeBody',
        'session', 'date', 'numberOfVolumes', 'documentNumber',
        'pages', 'publisher', 'place', 'url', 'language', 'shortTitle',
        'extra', 'rights'
    ]
};

// Base fields used as fallback for unknown item types
var BASE_FIELDS = [
    'title', 'abstractNote', 'date', 'url', 'language',
    'shortTitle', 'extra', 'rights', 'accessDate'
];

// Fields to skip when copying between items
var SKIP_FIELDS = ['id', 'itemType', 'creators', 'dateAdded'];

// ============================================================
// getFieldsForType — returns Set of valid field names
// ============================================================
function getFieldsForType(itemType) {
    var fields = FIELDS_BY_TYPE[itemType] || BASE_FIELDS;
    // Use object as set for compatibility (Zotero JS console)
    var fieldSet = {};
    for (var i = 0; i < fields.length; i++) {
        fieldSet[fields[i]] = true;
    }
    return fieldSet;
}

// ============================================================
// findLostFields — fields on item that are not valid for newType
// ============================================================
function findLostFields(item, newType) {
    var validFields = getFieldsForType(newType);
    var lost = {};

    for (var key in item) {
        if (!item.hasOwnProperty(key)) continue;
        if (SKIP_FIELDS.indexOf(key) !== -1) continue;
        if (key === 'tags' || key === 'collections') continue;

        var value = item[key];
        if (value === null || value === undefined || value === '') continue;
        if (!validFields[key]) {
            lost[key] = value;
        }
    }
    return lost;
}

// ============================================================
// preserveFieldsInExtra — append lost fields to item.extra
// ============================================================
function preserveFieldsInExtra(item, lostFields) {
    // Check if there are any lost fields to preserve
    var hasLostFields = false;
    for (var check in lostFields) {
        if (lostFields.hasOwnProperty(check)) { hasLostFields = true; break; }
    }
    if (!hasLostFields) return;

    var lines = [];

    // Always include original item type as first preserved line
    if (item.itemType) {
        lines.push('[ZotDupe:preserved] originalType: ' + item.itemType);
    }

    for (var field in lostFields) {
        if (!lostFields.hasOwnProperty(field)) continue;
        lines.push('[ZotDupe:preserved] ' + field + ': ' + lostFields[field]);
    }

    var block = lines.join('\n');
    if (!item.extra) {
        item.extra = block;
    } else {
        item.extra = item.extra + '\n' + block;
    }
}

// ============================================================
// copyMissingFields — copy non-empty donor fields to master
// ============================================================
function copyMissingFields(master, donor) {
    var copied = 0;
    for (var key in donor) {
        if (!donor.hasOwnProperty(key)) continue;
        if (SKIP_FIELDS.indexOf(key) !== -1) continue;
        if (key === 'tags' || key === 'collections') continue;

        var donorVal = donor[key];
        if (donorVal === null || donorVal === undefined || donorVal === '') continue;

        var masterVal = master[key];
        if (masterVal === null || masterVal === undefined || masterVal === '') {
            master[key] = donorVal;
            copied++;
        }
    }
    return copied;
}

// ============================================================
// unionTags — combine unique tags from all items
// ============================================================
function unionTags(master, otherItems) {
    if (!master.tags) master.tags = [];

    // Index existing tags by name
    var seen = {};
    for (var i = 0; i < master.tags.length; i++) {
        seen[master.tags[i].tag] = true;
    }

    var added = 0;
    for (var j = 0; j < otherItems.length; j++) {
        var tags = otherItems[j].tags;
        if (!tags) continue;
        for (var k = 0; k < tags.length; k++) {
            var tagName = tags[k].tag;
            if (!seen[tagName]) {
                seen[tagName] = true;
                master.tags.push({tag: tagName, type: tags[k].type || 0});
                added++;
            }
        }
    }
    return added;
}

// ============================================================
// unionCollections — combine unique collection IDs
// ============================================================
function unionCollections(master, otherItems) {
    if (!master.collections) master.collections = [];

    var seen = {};
    for (var i = 0; i < master.collections.length; i++) {
        seen[master.collections[i]] = true;
    }

    var added = 0;
    for (var j = 0; j < otherItems.length; j++) {
        var colls = otherItems[j].collections;
        if (!colls) continue;
        for (var k = 0; k < colls.length; k++) {
            if (!seen[colls[k]]) {
                seen[colls[k]] = true;
                master.collections.push(colls[k]);
                added++;
            }
        }
    }
    return added;
}

// ============================================================
// _concatUniqueExtra — merge Extra lines, deduplicating
// ============================================================
function _concatUniqueExtra(master, otherItems) {
    var seen = {};
    var masterLines = (master.extra || '').split('\n');
    for (var i = 0; i < masterLines.length; i++) {
        if (masterLines[i] !== '') seen[masterLines[i]] = true;
    }

    var newLines = [];
    for (var j = 0; j < otherItems.length; j++) {
        var extra = otherItems[j].extra;
        if (!extra) continue;
        var lines = extra.split('\n');
        for (var k = 0; k < lines.length; k++) {
            if (lines[k] !== '' && !seen[lines[k]]) {
                seen[lines[k]] = true;
                newLines.push(lines[k]);
            }
        }
    }

    if (newLines.length > 0) {
        if (master.extra) {
            master.extra = master.extra + '\n' + newLines.join('\n');
        } else {
            master.extra = newLines.join('\n');
        }
    }
}

// ============================================================
// mergeItems — orchestrate a full merge
// ============================================================
function mergeItems(canonicalItem, duplicateItems) {
    var fieldsPreserved = 0;

    // a. For cross-type duplicates: find and preserve lost fields
    for (var i = 0; i < duplicateItems.length; i++) {
        var dup = duplicateItems[i];
        if (dup.itemType && dup.itemType !== canonicalItem.itemType) {
            var lost = findLostFields(dup, canonicalItem.itemType);
            var count = 0;
            for (var k in lost) {
                if (lost.hasOwnProperty(k)) count++;
            }
            if (count > 0) {
                preserveFieldsInExtra(dup, lost);
                fieldsPreserved += count;
            }
        }
    }

    // b. Copy missing fields from each duplicate to canonical
    for (var j = 0; j < duplicateItems.length; j++) {
        copyMissingFields(canonicalItem, duplicateItems[j]);
    }

    // c. Union tags
    var tagsAdded = unionTags(canonicalItem, duplicateItems);

    // d. Union collections
    var collectionsAdded = unionCollections(canonicalItem, duplicateItems);

    // e. Concatenate unique Extra lines
    _concatUniqueExtra(canonicalItem, duplicateItems);

    // f. Return merge log
    var mergedIds = [];
    for (var m = 0; m < duplicateItems.length; m++) {
        mergedIds.push(duplicateItems[m].id);
    }

    return {
        master: canonicalItem.id,
        merged: mergedIds,
        fieldsPreserved: fieldsPreserved,
        tagsAdded: tagsAdded,
        collectionsAdded: collectionsAdded
    };
}

// ============================================================
// Exports
// ============================================================
ZotDupe.Merger.FIELDS_BY_TYPE = FIELDS_BY_TYPE;
ZotDupe.Merger.getFieldsForType = getFieldsForType;
ZotDupe.Merger.findLostFields = findLostFields;
ZotDupe.Merger.preserveFieldsInExtra = preserveFieldsInExtra;
ZotDupe.Merger.copyMissingFields = copyMissingFields;
ZotDupe.Merger.unionTags = unionTags;
ZotDupe.Merger.unionCollections = unionCollections;
ZotDupe.Merger.mergeItems = mergeItems;
