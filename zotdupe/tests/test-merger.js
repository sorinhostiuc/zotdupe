/**
 * Tests for ZotDupe Cross-Type Merger
 *
 * Self-contained — can be run in Zotero's JS console or Node.js.
 * In Node.js: node zotdupe/tests/test-merger.js
 */

// Load dependencies when running in Node.js
if (typeof ZotDupe === 'undefined') {
    var ZotDupe = {};
    var fs = require('fs');
    var path = require('path');
    eval(fs.readFileSync(
        path.join(__dirname, '..', 'src', 'merger.js'), 'utf-8'
    ));
}

function assert(condition, msg) {
    if (!condition) throw new Error('FAIL: ' + msg);
}

function assertDeepEqual(actual, expected, msg) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error('FAIL: ' + msg +
            '\n  Expected: ' + JSON.stringify(expected) +
            '\n  Actual:   ' + JSON.stringify(actual));
    }
}

var getFieldsForType = ZotDupe.Merger.getFieldsForType;
var findLostFields = ZotDupe.Merger.findLostFields;
var preserveFieldsInExtra = ZotDupe.Merger.preserveFieldsInExtra;
var copyMissingFields = ZotDupe.Merger.copyMissingFields;
var unionTags = ZotDupe.Merger.unionTags;
var unionCollections = ZotDupe.Merger.unionCollections;
var mergeItems = ZotDupe.Merger.mergeItems;
var FIELDS_BY_TYPE = ZotDupe.Merger.FIELDS_BY_TYPE;

var passed = 0;
var failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        if (typeof Zotero !== 'undefined') {
            Zotero.debug('[test-merger] PASS: ' + name);
        } else {
            console.log('PASS: ' + name);
        }
    } catch (e) {
        failed++;
        var msg = e.message || String(e);
        if (typeof Zotero !== 'undefined') {
            Zotero.debug('[test-merger] FAIL: ' + name + ' — ' + msg);
        } else {
            console.error('FAIL: ' + name + ' — ' + msg);
        }
    }
}

// ============================================================
// getFieldsForType
// ============================================================

test('getFieldsForType returns correct fields for journalArticle', function () {
    var fields = getFieldsForType('journalArticle');
    assert(fields['title'], 'should have title');
    assert(fields['DOI'], 'should have DOI');
    assert(fields['publicationTitle'], 'should have publicationTitle');
    assert(!fields['websiteTitle'], 'should not have websiteTitle');
});

test('getFieldsForType returns base fields for unknown type', function () {
    var fields = getFieldsForType('unknownType');
    assert(fields['title'], 'should have title');
    assert(fields['url'], 'should have url');
    assert(!fields['DOI'], 'should not have DOI');
});

// ============================================================
// findLostFields
// ============================================================

test('findLostFields: webpage -> statute loses websiteTitle, websiteType', function () {
    var webpageItem = {
        id: 1,
        itemType: 'webpage',
        title: 'Some law page',
        websiteTitle: 'Legislatie.just.ro',
        websiteType: 'Legal Database',
        url: 'http://example.com',
        date: '2024-01-15',
        tags: [],
        collections: []
    };

    var lost = findLostFields(webpageItem, 'statute');
    assert(lost['websiteTitle'] === 'Legislatie.just.ro',
        'websiteTitle should be lost');
    assert(lost['websiteType'] === 'Legal Database',
        'websiteType should be lost');
    assert(!lost['title'], 'title should NOT be lost (valid on statute)');
    assert(!lost['url'], 'url should NOT be lost (valid on statute)');
});

test('findLostFields: same type loses nothing', function () {
    var item = {
        id: 1,
        itemType: 'journalArticle',
        title: 'Test',
        DOI: '10.1234/test',
        tags: [],
        collections: []
    };

    var lost = findLostFields(item, 'journalArticle');
    var count = 0;
    for (var k in lost) {
        if (lost.hasOwnProperty(k)) count++;
    }
    assert(count === 0, 'same type should lose no fields');
});

test('findLostFields: skips empty and null values', function () {
    var item = {
        id: 1,
        itemType: 'webpage',
        title: 'Test',
        websiteTitle: '',
        websiteType: null,
        url: 'http://example.com',
        tags: [],
        collections: []
    };

    var lost = findLostFields(item, 'statute');
    assert(!lost['websiteTitle'], 'empty string should not be lost');
    assert(!lost['websiteType'], 'null should not be lost');
});

// ============================================================
// preserveFieldsInExtra
// ============================================================

test('preserveFieldsInExtra: correct format with [ZotDupe:preserved] prefix', function () {
    var item = {
        itemType: 'webpage',
        extra: ''
    };
    var lostFields = {
        websiteTitle: 'Legislatie.just.ro',
        websiteType: 'Legal Database'
    };

    preserveFieldsInExtra(item, lostFields);

    assert(item.extra.indexOf('[ZotDupe:preserved] originalType: webpage') !== -1,
        'should contain originalType line');
    assert(item.extra.indexOf('[ZotDupe:preserved] websiteTitle: Legislatie.just.ro') !== -1,
        'should contain websiteTitle line');
    assert(item.extra.indexOf('[ZotDupe:preserved] websiteType: Legal Database') !== -1,
        'should contain websiteType line');
});

test('preserveFieldsInExtra: appends to existing extra', function () {
    var item = {
        itemType: 'webpage',
        extra: 'Existing note here'
    };
    var lostFields = {websiteTitle: 'Test Site'};

    preserveFieldsInExtra(item, lostFields);

    assert(item.extra.indexOf('Existing note here') === 0,
        'should keep existing extra at start');
    assert(item.extra.indexOf('[ZotDupe:preserved] originalType: webpage') !== -1,
        'should contain originalType');
    assert(item.extra.indexOf('[ZotDupe:preserved] websiteTitle: Test Site') !== -1,
        'should contain preserved field');
});

test('preserveFieldsInExtra: no-op when no lost fields', function () {
    var item = {itemType: 'book', extra: 'existing'};
    preserveFieldsInExtra(item, {});
    assert(item.extra === 'existing', 'extra should be unchanged');
});

// ============================================================
// copyMissingFields
// ============================================================

test('copyMissingFields: copies non-empty fields where master is empty', function () {
    var master = {
        id: 1,
        itemType: 'statute',
        title: 'Main Title',
        url: '',
        extra: ''
    };
    var donor = {
        id: 2,
        itemType: 'webpage',
        title: 'Donor Title',
        url: 'http://example.com',
        date: '2024-01-01'
    };

    var copied = copyMissingFields(master, donor);

    assert(master.title === 'Main Title', 'master title should be kept');
    assert(master.url === 'http://example.com', 'url should be copied from donor');
    assert(master.date === '2024-01-01', 'date should be copied from donor');
    assert(copied === 2, 'should report 2 fields copied');
});

test('copyMissingFields: skips id, itemType, creators, dateAdded', function () {
    var master = {id: 1, itemType: 'statute', title: 'Test'};
    var donor = {
        id: 99,
        itemType: 'webpage',
        creators: [{lastName: 'Smith'}],
        dateAdded: '2020-01-01',
        title: ''
    };

    copyMissingFields(master, donor);

    assert(master.id === 1, 'id should not be overwritten');
    assert(master.itemType === 'statute', 'itemType should not be overwritten');
    assert(!master.creators, 'creators should not be copied');
    assert(!master.dateAdded, 'dateAdded should not be copied');
});

test('copyMissingFields: does not overwrite existing non-empty values', function () {
    var master = {id: 1, title: 'Master Title', url: 'http://master.com'};
    var donor = {id: 2, title: 'Donor Title', url: 'http://donor.com'};

    copyMissingFields(master, donor);

    assert(master.title === 'Master Title', 'title should not be overwritten');
    assert(master.url === 'http://master.com', 'url should not be overwritten');
});

// ============================================================
// unionTags
// ============================================================

test('unionTags: combines unique tags, deduplicates by name', function () {
    var master = {
        tags: [
            {tag: 'law', type: 0},
            {tag: 'romania', type: 1}
        ]
    };
    var others = [
        {tags: [{tag: 'romania', type: 0}, {tag: 'civil-code', type: 0}]},
        {tags: [{tag: 'law', type: 0}, {tag: 'eu-directive', type: 1}]}
    ];

    var added = unionTags(master, others);

    assert(master.tags.length === 4, 'should have 4 unique tags');
    assert(added === 2, 'should report 2 tags added');

    var names = master.tags.map(function (t) { return t.tag; });
    assert(names.indexOf('civil-code') !== -1, 'should include civil-code');
    assert(names.indexOf('eu-directive') !== -1, 'should include eu-directive');
});

test('unionTags: handles missing tags arrays', function () {
    var master = {tags: [{tag: 'existing', type: 0}]};
    var others = [{}, {tags: null}];

    var added = unionTags(master, others);
    assert(added === 0, 'should add 0 tags');
    assert(master.tags.length === 1, 'should still have 1 tag');
});

test('unionTags: initializes master.tags if missing', function () {
    var master = {};
    var others = [{tags: [{tag: 'new', type: 0}]}];

    unionTags(master, others);
    assert(master.tags.length === 1, 'should have 1 tag');
    assert(master.tags[0].tag === 'new', 'tag should be "new"');
});

// ============================================================
// unionCollections
// ============================================================

test('unionCollections: combines unique IDs', function () {
    var master = {collections: ['AAA', 'BBB']};
    var others = [
        {collections: ['BBB', 'CCC']},
        {collections: ['DDD', 'AAA']}
    ];

    var added = unionCollections(master, others);

    assert(master.collections.length === 4, 'should have 4 unique collections');
    assert(added === 2, 'should report 2 added');
    assert(master.collections.indexOf('CCC') !== -1, 'should include CCC');
    assert(master.collections.indexOf('DDD') !== -1, 'should include DDD');
});

test('unionCollections: handles missing collections', function () {
    var master = {collections: ['AAA']};
    var others = [{}, {collections: null}];

    var added = unionCollections(master, others);
    assert(added === 0, 'should add 0');
    assert(master.collections.length === 1, 'should still have 1');
});

// ============================================================
// mergeItems — full integration
// ============================================================

test('mergeItems: cross-type merge with field preservation, tag/collection union', function () {
    var canonical = {
        id: 100,
        itemType: 'statute',
        title: 'Legea nr. 123/2024',
        code: 'Monitorul Oficial',
        extra: '',
        tags: [{tag: 'law', type: 0}],
        collections: ['COL1']
    };

    var dup1 = {
        id: 201,
        itemType: 'webpage',
        title: 'Legea nr. 123/2024',
        websiteTitle: 'Legislatie.just.ro',
        websiteType: 'Legal Database',
        url: 'http://legislatie.just.ro/123',
        date: '2024-03-15',
        extra: '',
        tags: [{tag: 'law', type: 0}, {tag: 'civil', type: 1}],
        collections: ['COL1', 'COL2']
    };

    var dup2 = {
        id: 202,
        itemType: 'statute',
        title: '',
        section: 'Art. 5',
        dateEnacted: '2024-01-01',
        extra: 'Publisher: Parliament',
        tags: [{tag: 'parliament', type: 0}],
        collections: ['COL3']
    };

    var log = mergeItems(canonical, [dup1, dup2]);

    // Check merge log
    assert(log.master === 100, 'master should be canonical id');
    assertDeepEqual(log.merged, [201, 202], 'merged should list duplicate ids');
    assert(log.fieldsPreserved === 3,
        'should preserve 3 fields (websiteTitle, websiteType, date), got ' + log.fieldsPreserved);
    assert(log.tagsAdded === 2,
        'should add 2 tags (civil, parliament), got ' + log.tagsAdded);
    assert(log.collectionsAdded === 2,
        'should add 2 collections (COL2, COL3), got ' + log.collectionsAdded);

    // Check field copying
    assert(canonical.url === 'http://legislatie.just.ro/123',
        'url should be copied from dup1');
    assert(canonical.date === '2024-03-15',
        'date should be copied from dup1');
    assert(canonical.section === 'Art. 5',
        'section should be copied from dup2');
    assert(canonical.dateEnacted === '2024-01-01',
        'dateEnacted should be copied from dup2');

    // Check title was NOT overwritten (canonical has value)
    assert(canonical.title === 'Legea nr. 123/2024',
        'title should remain canonical value');

    // Check Extra contains preserved fields from dup1
    assert(canonical.extra.indexOf('[ZotDupe:preserved] websiteTitle: Legislatie.just.ro') !== -1,
        'extra should contain preserved websiteTitle');
    assert(canonical.extra.indexOf('[ZotDupe:preserved] websiteType: Legal Database') !== -1,
        'extra should contain preserved websiteType');

    // Check Extra contains unique lines from dup2
    assert(canonical.extra.indexOf('Publisher: Parliament') !== -1,
        'extra should contain dup2 extra line');

    // Check tags union
    assert(canonical.tags.length === 3, 'should have 3 tags');

    // Check collections union
    assert(canonical.collections.length === 3, 'should have 3 collections');
});

test('mergeItems: same-type merge does not preserve fields', function () {
    var canonical = {
        id: 1,
        itemType: 'journalArticle',
        title: 'Test Article',
        DOI: '10.1234/test',
        extra: '',
        tags: [],
        collections: []
    };
    var dup = {
        id: 2,
        itemType: 'journalArticle',
        title: '',
        volume: '42',
        issue: '3',
        extra: '',
        tags: [{tag: 'science', type: 0}],
        collections: ['C1']
    };

    var log = mergeItems(canonical, [dup]);

    assert(log.fieldsPreserved === 0, 'same-type should preserve 0 fields');
    assert(canonical.volume === '42', 'volume should be copied');
    assert(canonical.issue === '3', 'issue should be copied');
    assert(log.tagsAdded === 1, 'should add 1 tag');
    assert(log.collectionsAdded === 1, 'should add 1 collection');
});

// ============================================================
// Summary
// ============================================================

var summary = '\n=== test-merger: ' + passed + ' passed, ' + failed + ' failed ===';
if (typeof Zotero !== 'undefined') {
    Zotero.debug(summary);
} else {
    console.log(summary);
}
if (failed > 0 && typeof process !== 'undefined') process.exit(1);
