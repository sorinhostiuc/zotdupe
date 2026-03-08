/**
 * Tests for ZotDupe Canonical Item Selection
 *
 * Self-contained — can be run in Zotero's JS console or Node.js.
 * In Node.js: node zotdupe/tests/test-canonical.js
 */

// Load dependencies when running in Node.js
if (typeof ZotDupe === 'undefined') {
    var ZotDupe = {};
    var fs = require('fs');
    var path = require('path');
    // Load canonical.js
    eval(fs.readFileSync(
        path.join(__dirname, '..', 'src', 'canonical.js'), 'utf-8'
    ));
}

function assert(condition, msg) {
    if (!condition) throw new Error('FAIL: ' + msg);
}

var countFields = ZotDupe.Canonical.countFields;
var selectCanonical = ZotDupe.Canonical.selectCanonical;
var TYPE_PRIORITY = ZotDupe.Canonical.TYPE_PRIORITY;
var passed = 0;
var failed = 0;

function test(name, fn) {
    try {
        fn();
        if (typeof Zotero !== 'undefined') {
            Zotero.debug('[ZotDupe test] PASS: ' + name);
        } else {
            console.log('PASS: ' + name);
        }
        passed++;
    } catch (e) {
        if (typeof Zotero !== 'undefined') {
            Zotero.debug('[ZotDupe test] FAIL: ' + name + ' — ' + e.message);
        } else {
            console.error('FAIL: ' + name + ' — ' + e.message);
        }
        failed++;
    }
}

// ============================================================
// countFields tests
// ============================================================

test('countFields: counts non-empty string fields', function () {
    var item = { id: 1, itemType: 'book', title: 'Test', DOI: '10.1234', date: '', creators: [] };
    // Should count: title, DOI. Should skip: id, itemType, creators, date (empty string)
    assert(countFields(item) === 2, 'expected 2, got ' + countFields(item));
});

test('countFields: returns 0 for null/undefined', function () {
    assert(countFields(null) === 0, 'null should return 0');
    assert(countFields(undefined) === 0, 'undefined should return 0');
});

test('countFields: ignores non-string fields', function () {
    var item = { id: 1, itemType: 'book', title: 'Test', hasPDF: true, count: 5 };
    // Only title is a non-excluded string field
    assert(countFields(item) === 1, 'expected 1, got ' + countFields(item));
});

// ============================================================
// selectCanonical: type priority tests
// ============================================================

test('journalArticle beats preprint', function () {
    var journal = { id: 1, itemType: 'journalArticle', title: 'A' };
    var preprint = { id: 2, itemType: 'preprint', title: 'A' };
    var result = selectCanonical([preprint, journal]);
    assert(result.id === 1, 'journalArticle should win');
});

test('preprint beats webpage', function () {
    var preprint = { id: 1, itemType: 'preprint', title: 'A' };
    var webpage = { id: 2, itemType: 'webpage', title: 'A' };
    var result = selectCanonical([webpage, preprint]);
    assert(result.id === 1, 'preprint should win');
});

test('statute beats webpage (legal items)', function () {
    var statute = { id: 1, itemType: 'statute', title: 'Law X' };
    var webpage = { id: 2, itemType: 'webpage', title: 'Law X' };
    var result = selectCanonical([webpage, statute]);
    assert(result.id === 1, 'statute should win');
});

// ============================================================
// selectCanonical: field completeness tests
// ============================================================

test('more complete metadata wins at same type priority', function () {
    var sparse = { id: 1, itemType: 'journalArticle', title: 'A' };
    var rich = { id: 2, itemType: 'journalArticle', title: 'A', date: '2020', volume: '5', pages: '1-10', url: 'http://example.com' };
    var result = selectCanonical([sparse, rich]);
    assert(result.id === 2, 'richer item should win');
});

// ============================================================
// selectCanonical: DOI presence tests
// ============================================================

test('DOI presence wins when field count is equal', function () {
    var noDOI = { id: 1, itemType: 'journalArticle', title: 'A', date: '2020' };
    var withDOI = { id: 2, itemType: 'journalArticle', title: 'A', DOI: '10.1234/x' };
    // Both have 2 non-excluded string fields (title+date vs title+DOI)
    assert(countFields(noDOI) === countFields(withDOI), 'field counts should be equal');
    var result = selectCanonical([noDOI, withDOI]);
    assert(result.id === 2, 'item with DOI should win');
});

// ============================================================
// selectCanonical: PDF attachment tests
// ============================================================

test('PDF attachment wins when DOI both present', function () {
    var noPDF = { id: 1, itemType: 'journalArticle', title: 'A', DOI: '10.1234/x' };
    var withPDF = { id: 2, itemType: 'journalArticle', title: 'A', DOI: '10.5678/y', hasPDF: true };
    var result = selectCanonical([noPDF, withPDF]);
    assert(result.id === 2, 'item with PDF should win');
});

test('PDF attachment wins when DOI both absent', function () {
    var noPDF = { id: 1, itemType: 'journalArticle', title: 'A', date: '2020' };
    var withPDF = { id: 2, itemType: 'journalArticle', title: 'A', date: '2020', hasPDF: true };
    // field counts: noPDF has title+date=2, withPDF has title+date=2 (hasPDF is boolean, not counted)
    assert(countFields(noPDF) === countFields(withPDF), 'field counts should be equal');
    var result = selectCanonical([noPDF, withPDF]);
    assert(result.id === 2, 'item with PDF should win');
});

// ============================================================
// selectCanonical: dateAdded tiebreaker
// ============================================================

test('earlier dateAdded wins as tiebreaker', function () {
    var newer = { id: 1, itemType: 'journalArticle', title: 'A', DOI: '10.1234', hasPDF: true, dateAdded: '2024-06-01T12:00:00Z' };
    var older = { id: 2, itemType: 'journalArticle', title: 'A', DOI: '10.5678', hasPDF: true, dateAdded: '2023-01-15T08:00:00Z' };
    var result = selectCanonical([newer, older]);
    assert(result.id === 2, 'earlier dateAdded should win');
});

// ============================================================
// selectCanonical: edge cases
// ============================================================

test('single item returns itself', function () {
    var item = { id: 42, itemType: 'book', title: 'Solo' };
    var result = selectCanonical([item]);
    assert(result.id === 42, 'single item should be returned');
});

test('unknown item types default to 0 priority', function () {
    var unknown = { id: 1, itemType: 'foobar', title: 'A' };
    var doc = { id: 2, itemType: 'document', title: 'A' };
    var result = selectCanonical([unknown, doc]);
    assert(result.id === 2, 'document (priority 1) should beat unknown (priority 0)');
});

test('empty array returns null', function () {
    var result = selectCanonical([]);
    assert(result === null, 'empty array should return null');
});

test('null input returns null', function () {
    var result = selectCanonical(null);
    assert(result === null, 'null should return null');
});

// ============================================================
// Summary
// ============================================================
var summary = '\n=== Canonical Tests: ' + passed + ' passed, ' + failed + ' failed ===';
if (typeof Zotero !== 'undefined') {
    Zotero.debug(summary);
} else {
    console.log(summary);
}
if (failed > 0 && typeof process !== 'undefined') process.exit(1);
