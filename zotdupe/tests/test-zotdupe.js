/**
 * Tests for ZotDupe Main Orchestrator (pure-logic parts)
 *
 * Run with: node zotdupe/tests/test-zotdupe.js
 */

// Bootstrap the ZotDupe namespace
var ZotDupe = {};

// Load dependencies (normalize needed by blocker/scanner, but we only test pure logic here)
eval(require('fs').readFileSync(__dirname + '/../src/utils/normalize.js', 'utf8'));
eval(require('fs').readFileSync(__dirname + '/../src/zotdupe.js', 'utf8'));

var clusterPairs = ZotDupe.clusterPairs;
var extractFromExtra = ZotDupe.extractFromExtra;
var isExcludedPairIn = ZotDupe.isExcludedPairIn;
var exportCSV = ZotDupe.exportCSV;

var passed = 0;
var failed = 0;

function deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
        if (a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i])) return false;
        }
        return true;
    }
    var keysA = Object.keys(a).sort();
    var keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    for (var j = 0; j < keysA.length; j++) {
        if (keysA[j] !== keysB[j]) return false;
        if (!deepEqual(a[keysA[j]], b[keysB[j]])) return false;
    }
    return true;
}

function assert(condition, msg) {
    if (condition) {
        passed++;
    } else {
        failed++;
        console.error('FAIL: ' + msg);
    }
}

function assertEq(actual, expected, msg) {
    if (deepEqual(actual, expected)) {
        passed++;
    } else {
        failed++;
        console.error('FAIL: ' + msg);
        console.error('  Expected:', JSON.stringify(expected));
        console.error('  Actual:  ', JSON.stringify(actual));
    }
}

// ============================================================
// Tests: extractFromExtra
// ============================================================
console.log('\n--- extractFromExtra ---');

(function () {
    var extra = 'PMID: 12345\nSome other line';
    assertEq(extractFromExtra(extra, 'PMID'), '12345',
        'extractFromExtra: PMID from multiline extra');
})();

(function () {
    var extra = 'PMCID: PMC1234567\nPMID: 99999';
    assertEq(extractFromExtra(extra, 'PMCID'), 'PMC1234567',
        'extractFromExtra: PMCID from extra');
    assertEq(extractFromExtra(extra, 'PMID'), '99999',
        'extractFromExtra: PMID from same extra');
})();

(function () {
    assertEq(extractFromExtra('', 'PMID'), '',
        'extractFromExtra: empty extra returns empty string');
    assertEq(extractFromExtra(null, 'PMID'), '',
        'extractFromExtra: null extra returns empty string');
    assertEq(extractFromExtra('PMID: 12345', ''), '',
        'extractFromExtra: empty key returns empty string');
})();

(function () {
    var extra = 'pmid: 55555\nTitle: Some Title';
    assertEq(extractFromExtra(extra, 'PMID'), '55555',
        'extractFromExtra: case-insensitive key match');
})();

(function () {
    var extra = 'PMID:67890';
    assertEq(extractFromExtra(extra, 'PMID'), '67890',
        'extractFromExtra: no space after colon');
})();

// ============================================================
// Tests: clusterPairs
// ============================================================
console.log('\n--- clusterPairs ---');

(function () {
    // Chain: A-B, B-C should form one cluster
    var pairs = [
        { idA: 'A', idB: 'B', score: 0.9, matchType: 'DOI identic' },
        { idA: 'B', idB: 'C', score: 0.95, matchType: 'title+author' }
    ];
    var clusters = clusterPairs(pairs);
    assertEq(clusters.length, 1, 'clusterPairs chain: one cluster');
    assert(clusters[0].ids.length === 3, 'clusterPairs chain: 3 items in cluster');
    // IDs should contain A, B, C
    var ids = clusters[0].ids.sort();
    assertEq(ids, ['A', 'B', 'C'], 'clusterPairs chain: correct IDs');
    assertEq(clusters[0].score, 0.95, 'clusterPairs chain: max score');
    assertEq(clusters[0].matchType, 'title+author',
        'clusterPairs chain: matchType of highest score');
})();

(function () {
    // Disjoint pairs should form separate clusters
    var pairs = [
        { idA: 'X', idB: 'Y', score: 0.8, matchType: 'DOI identic' },
        { idA: 'P', idB: 'Q', score: 0.7, matchType: 'title' }
    ];
    var clusters = clusterPairs(pairs);
    assertEq(clusters.length, 2, 'clusterPairs disjoint: two clusters');
    // Sort clusters by score descending for deterministic comparison
    clusters.sort(function (a, b) { return b.score - a.score; });
    assertEq(clusters[0].score, 0.8, 'clusterPairs disjoint: first cluster score');
    assertEq(clusters[1].score, 0.7, 'clusterPairs disjoint: second cluster score');
    assert(clusters[0].ids.sort().join(',') === 'X,Y',
        'clusterPairs disjoint: first cluster IDs');
    assert(clusters[1].ids.sort().join(',') === 'P,Q',
        'clusterPairs disjoint: second cluster IDs');
})();

(function () {
    // Empty input
    var clusters = clusterPairs([]);
    assertEq(clusters.length, 0, 'clusterPairs empty: no clusters');
    assertEq(clusterPairs(null).length, 0, 'clusterPairs null: no clusters');
})();

(function () {
    // Single pair
    var pairs = [
        { idA: 1, idB: 2, score: 0.85, matchType: 'ISBN identic' }
    ];
    var clusters = clusterPairs(pairs);
    assertEq(clusters.length, 1, 'clusterPairs single: one cluster');
    assertEq(clusters[0].ids.length, 2, 'clusterPairs single: 2 items');
    assertEq(clusters[0].score, 0.85, 'clusterPairs single: correct score');
})();

(function () {
    // Fully connected triangle: A-B, B-C, A-C
    var pairs = [
        { idA: 'A', idB: 'B', score: 0.7, matchType: 'title' },
        { idA: 'B', idB: 'C', score: 0.8, matchType: 'DOI identic' },
        { idA: 'A', idB: 'C', score: 0.9, matchType: 'PMID identic' }
    ];
    var clusters = clusterPairs(pairs);
    assertEq(clusters.length, 1, 'clusterPairs triangle: one cluster');
    assertEq(clusters[0].ids.length, 3, 'clusterPairs triangle: 3 items');
    assertEq(clusters[0].score, 0.9, 'clusterPairs triangle: max score');
    assertEq(clusters[0].matchType, 'PMID identic',
        'clusterPairs triangle: matchType of highest score');
})();

// ============================================================
// Tests: isExcludedPairIn
// ============================================================
console.log('\n--- isExcludedPairIn ---');

(function () {
    var excluded = ['ABC:XYZ', 'DEF:GHI'];
    assert(isExcludedPairIn('ABC', 'XYZ', excluded) === true,
        'isExcludedPairIn: finds existing pair (order A,B)');
    assert(isExcludedPairIn('XYZ', 'ABC', excluded) === true,
        'isExcludedPairIn: finds existing pair (reversed order)');
    assert(isExcludedPairIn('ABC', 'DEF', excluded) === false,
        'isExcludedPairIn: returns false for non-excluded pair');
    assert(isExcludedPairIn('GHI', 'DEF', excluded) === true,
        'isExcludedPairIn: finds second pair (reversed)');
})();

(function () {
    assert(isExcludedPairIn('A', 'B', []) === false,
        'isExcludedPairIn: empty list returns false');
})();

// ============================================================
// Tests: _sortedPairKey
// ============================================================
console.log('\n--- _sortedPairKey ---');

(function () {
    assertEq(ZotDupe._sortedPairKey('B', 'A'), 'A:B',
        '_sortedPairKey: sorts keys alphabetically');
    assertEq(ZotDupe._sortedPairKey('A', 'B'), 'A:B',
        '_sortedPairKey: already sorted');
    assertEq(ZotDupe._sortedPairKey('XYZ', 'ABC'), 'ABC:XYZ',
        '_sortedPairKey: longer keys');
})();

// ============================================================
// Tests: exportCSV
// ============================================================
console.log('\n--- exportCSV ---');

(function () {
    var clusters = [
        {
            score: 0.95,
            classification: 'sure',
            matchType: 'DOI identic',
            items: [
                {
                    id: 101,
                    itemType: 'journalArticle',
                    title: 'Test Article One',
                    creators: [{ firstName: 'John', lastName: 'Doe' }],
                    date: '2023-01-15',
                    DOI: '10.1000/test'
                },
                {
                    id: 102,
                    itemType: 'journalArticle',
                    title: 'Test Article One',
                    creators: [{ firstName: 'J.', lastName: 'Doe' }],
                    date: '2023',
                    DOI: '10.1000/test'
                }
            ]
        }
    ];

    var csv = exportCSV(clusters, { 1: 'merged' });
    var lines = csv.split('\n');

    // Header line
    assertEq(lines[0],
        'ClusterID,Score,Classification,MatchType,Action,ItemID,ItemType,Title,Authors,Year,DOI',
        'exportCSV: correct header');

    // Should have 3 lines total (header + 2 items)
    assertEq(lines.length, 3, 'exportCSV: correct number of lines');

    // First data row
    assert(lines[1].indexOf('101') !== -1, 'exportCSV: first item ID present');
    assert(lines[1].indexOf('0.9500') !== -1, 'exportCSV: score formatted');
    assert(lines[1].indexOf('sure') !== -1, 'exportCSV: classification present');
    assert(lines[1].indexOf('DOI identic') !== -1, 'exportCSV: matchType present');
    assert(lines[1].indexOf('merged') !== -1, 'exportCSV: action present');
    assert(lines[1].indexOf('Doe John') !== -1, 'exportCSV: author present');
    assert(lines[1].indexOf('2023') !== -1, 'exportCSV: year present');
    assert(lines[1].indexOf('10.1000/test') !== -1, 'exportCSV: DOI present');
})();

(function () {
    // Test CSV escaping for values with commas
    var clusters = [
        {
            score: 0.80,
            classification: 'probable',
            matchType: 'title+author',
            items: [
                {
                    id: 201,
                    itemType: 'book',
                    title: 'Title, With Comma',
                    creators: [],
                    date: '2020',
                    DOI: ''
                }
            ]
        }
    ];

    var csv = exportCSV(clusters);
    var lines = csv.split('\n');
    assert(lines[1].indexOf('"Title, With Comma"') !== -1,
        'exportCSV: commas in title are quoted');
})();

(function () {
    // Empty clusters
    var csv = exportCSV([]);
    var lines = csv.split('\n');
    assertEq(lines.length, 1, 'exportCSV: empty clusters produce header only');
})();

// ============================================================
// Tests: _csvEscape
// ============================================================
console.log('\n--- _csvEscape ---');

(function () {
    assertEq(ZotDupe._csvEscape('simple'), 'simple',
        '_csvEscape: no special chars');
    assertEq(ZotDupe._csvEscape('has,comma'), '"has,comma"',
        '_csvEscape: wraps comma');
    assertEq(ZotDupe._csvEscape('has"quote'), '"has""quote"',
        '_csvEscape: escapes quote');
    assertEq(ZotDupe._csvEscape('has\nnewline'), '"has\nnewline"',
        '_csvEscape: wraps newline');
})();

// ============================================================
// Summary
// ============================================================
console.log('\n=============================');
console.log('Passed: ' + passed + '  Failed: ' + failed);
console.log('=============================');

if (failed > 0) process.exit(1);
