/**
 * Tests for ZotDupe MinHash LSH Utilities
 *
 * Self-contained — can be run in Zotero's JS console or Node.js.
 * In Node.js: node zotdupe/tests/test-minhash.js
 */

// Load the module under test when running in Node.js
if (typeof ZotDupe === 'undefined') {
    var ZotDupe = {};
    var fs = require('fs');
    var path = require('path');
    var code = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'utils', 'minhash.js'), 'utf-8'
    );
    eval(code);
}

function assert(condition, msg) {
    if (!condition) throw new Error('FAIL: ' + msg);
}

function assertEq(actual, expected, msg) {
    if (actual !== expected) {
        throw new Error(
            'FAIL: ' + msg + ' — expected ' + JSON.stringify(expected) +
            ', got ' + JSON.stringify(actual)
        );
    }
}

var passed = 0;
var failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        if (typeof Zotero !== 'undefined') {
            Zotero.debug('[test-minhash] PASS: ' + name);
        } else {
            console.log('PASS: ' + name);
        }
    } catch (e) {
        failed++;
        var msg = e.message || String(e);
        if (typeof Zotero !== 'undefined') {
            Zotero.debug('[test-minhash] FAIL: ' + name + ' — ' + msg);
        } else {
            console.error('FAIL: ' + name + ' — ' + msg);
        }
    }
}

// ——— shingles ———

test('shingles: "abcde" with k=3 produces correct set', function () {
    var s = ZotDupe.MinHash.shingles('abcde', 3);
    assert(s instanceof Set, 'should return a Set');
    assertEq(s.size, 3, 'should have 3 shingles');
    assert(s.has('abc'), 'should contain "abc"');
    assert(s.has('bcd'), 'should contain "bcd"');
    assert(s.has('cde'), 'should contain "cde"');
});

test('shingles: default k=3', function () {
    var s = ZotDupe.MinHash.shingles('abcde');
    assertEq(s.size, 3, 'default k should be 3');
});

test('shingles: text shorter than k returns empty set', function () {
    var s = ZotDupe.MinHash.shingles('ab', 3);
    assertEq(s.size, 0, 'should be empty');
});

test('shingles: empty/null input returns empty set', function () {
    assertEq(ZotDupe.MinHash.shingles('', 3).size, 0, 'empty string');
    assertEq(ZotDupe.MinHash.shingles(null, 3).size, 0, 'null');
});

// ——— hashCode ———

test('hashCode: deterministic', function () {
    var h1 = ZotDupe.MinHash.hashCode('hello');
    var h2 = ZotDupe.MinHash.hashCode('hello');
    assertEq(h1, h2, 'same input should give same hash');
});

test('hashCode: different strings produce different hashes', function () {
    var h1 = ZotDupe.MinHash.hashCode('hello');
    var h2 = ZotDupe.MinHash.hashCode('world');
    assert(h1 !== h2, 'different inputs should (likely) differ');
});

test('hashCode: returns non-negative integer', function () {
    var h = ZotDupe.MinHash.hashCode('test');
    assert(h >= 0, 'should be non-negative');
    assertEq(h, Math.floor(h), 'should be integer');
});

// ——— minhashSignature ———

test('minhashSignature: produces array of correct length (default 128)', function () {
    var s = ZotDupe.MinHash.shingles('the quick brown fox jumps');
    var sig = ZotDupe.MinHash.minhashSignature(s);
    assertEq(sig.length, 128, 'should have 128 elements');
    for (var i = 0; i < sig.length; i++) {
        assert(typeof sig[i] === 'number', 'element ' + i + ' should be a number');
        assert(sig[i] !== Infinity, 'element ' + i + ' should not be Infinity');
    }
});

test('minhashSignature: custom numHashes', function () {
    var s = ZotDupe.MinHash.shingles('hello world');
    var sig = ZotDupe.MinHash.minhashSignature(s, 64);
    assertEq(sig.length, 64, 'should have 64 elements');
});

test('minhashSignature: deterministic', function () {
    var s = ZotDupe.MinHash.shingles('deterministic test');
    var sig1 = ZotDupe.MinHash.minhashSignature(s, 32);
    var sig2 = ZotDupe.MinHash.minhashSignature(s, 32);
    for (var i = 0; i < sig1.length; i++) {
        assertEq(sig1[i], sig2[i], 'position ' + i + ' should match');
    }
});

test('minhashSignature: empty shingle set returns Infinity array', function () {
    var sig = ZotDupe.MinHash.minhashSignature(new Set(), 8);
    assertEq(sig.length, 8, 'should have 8 elements');
    for (var i = 0; i < sig.length; i++) {
        assertEq(sig[i], Infinity, 'element ' + i + ' should be Infinity');
    }
});

// ——— signatureSimilarity ———

test('signatureSimilarity: identical signatures return 1.0', function () {
    var sig = [1, 2, 3, 4, 5];
    var sim = ZotDupe.MinHash.signatureSimilarity(sig, sig.slice());
    assertEq(sim, 1.0, 'identical signatures should give 1.0');
});

test('signatureSimilarity: completely different signatures return low value', function () {
    var sig1 = [1, 2, 3, 4, 5, 6, 7, 8];
    var sig2 = [9, 10, 11, 12, 13, 14, 15, 16];
    var sim = ZotDupe.MinHash.signatureSimilarity(sig1, sig2);
    assertEq(sim, 0.0, 'completely different should give 0.0');
});

test('signatureSimilarity: partial overlap returns correct fraction', function () {
    var sig1 = [1, 2, 3, 4];
    var sig2 = [1, 2, 99, 98];
    var sim = ZotDupe.MinHash.signatureSimilarity(sig1, sig2);
    assertEq(sim, 0.5, 'half matching should give 0.5');
});

// ——— Similar vs dissimilar texts ———

test('similar texts have higher signature similarity than dissimilar texts', function () {
    var textA = 'the influence of machine learning on modern healthcare systems';
    var textB = 'the influence of machine learning on contemporary healthcare';
    var textC = 'quantum gravity implications for condensed matter physics';

    var shA = ZotDupe.MinHash.shingles(textA);
    var shB = ZotDupe.MinHash.shingles(textB);
    var shC = ZotDupe.MinHash.shingles(textC);

    var sigA = ZotDupe.MinHash.minhashSignature(shA, 128);
    var sigB = ZotDupe.MinHash.minhashSignature(shB, 128);
    var sigC = ZotDupe.MinHash.minhashSignature(shC, 128);

    var simAB = ZotDupe.MinHash.signatureSimilarity(sigA, sigB);
    var simAC = ZotDupe.MinHash.signatureSimilarity(sigA, sigC);

    assert(simAB > simAC,
        'similar texts (' + simAB.toFixed(3) + ') should score higher than dissimilar (' + simAC.toFixed(3) + ')');
    assert(simAB > 0.3, 'similar texts should have reasonable similarity, got ' + simAB.toFixed(3));
});

// ——— lshBands ———

test('lshBands: returns correct number of bands', function () {
    var sig = [];
    for (var i = 0; i < 128; i++) sig.push(i);
    var bands = ZotDupe.MinHash.lshBands(sig, 16, 8);
    assertEq(bands.length, 16, 'should produce 16 bands');
});

test('lshBands: identical signatures produce identical bands', function () {
    var sig = [];
    for (var i = 0; i < 128; i++) sig.push(i * 7 + 3);
    var bands1 = ZotDupe.MinHash.lshBands(sig, 16, 8);
    var bands2 = ZotDupe.MinHash.lshBands(sig.slice(), 16, 8);
    for (var i = 0; i < bands1.length; i++) {
        assertEq(bands1[i], bands2[i], 'band ' + i + ' should match');
    }
});

test('lshBands: different signatures produce different bands', function () {
    var sig1 = [];
    var sig2 = [];
    for (var i = 0; i < 128; i++) {
        sig1.push(i);
        sig2.push(i + 1000);
    }
    var bands1 = ZotDupe.MinHash.lshBands(sig1, 16, 8);
    var bands2 = ZotDupe.MinHash.lshBands(sig2, 16, 8);
    var allSame = true;
    for (var i = 0; i < bands1.length; i++) {
        if (bands1[i] !== bands2[i]) allSame = false;
    }
    assert(!allSame, 'different signatures should produce different bands');
});

// ——— lshCandidates ———

test('lshCandidates: similar items should be candidate pairs', function () {
    var items = [
        { id: 1, normalizedTitle: 'the influence of machine learning on modern healthcare systems and patient outcomes' },
        { id: 2, normalizedTitle: 'the influence of machine learning on modern healthcare systems and patient outcome' },
        { id: 3, normalizedTitle: 'quantum gravity implications for condensed matter physics experiments in laboratories' }
    ];
    // Use more bands with fewer rows for higher recall on similar items
    var candidates = ZotDupe.MinHash.lshCandidates(items, 32, 4);
    // Items 1 and 2 are very similar and should appear as candidates
    var found12 = false;
    for (var i = 0; i < candidates.length; i++) {
        var pair = candidates[i];
        if ((pair[0] === 1 && pair[1] === 2) || (pair[0] === 2 && pair[1] === 1)) {
            found12 = true;
        }
    }
    assert(found12, 'similar items (1,2) should be candidate pairs');
});

test('lshCandidates: dissimilar items likely not candidate pairs', function () {
    var items = [
        { id: 'a', normalizedTitle: 'deep learning approaches for natural language processing tasks' },
        { id: 'b', normalizedTitle: 'geological survey of volcanic activity in the pacific rim region' }
    ];
    var candidates = ZotDupe.MinHash.lshCandidates(items);
    // Dissimilar items should generally not be candidates (though LSH is probabilistic)
    assertEq(candidates.length, 0,
        'dissimilar items should not be candidates (got ' + candidates.length + ' pairs)');
});

test('lshCandidates: empty input returns empty array', function () {
    assertEq(ZotDupe.MinHash.lshCandidates([]).length, 0, 'empty items');
    assertEq(ZotDupe.MinHash.lshCandidates(null).length, 0, 'null items');
});

test('lshCandidates: pairs are deduplicated', function () {
    var items = [
        { id: 1, normalizedTitle: 'abc def ghi jkl mno pqr stu' },
        { id: 2, normalizedTitle: 'abc def ghi jkl mno pqr stu' } // identical
    ];
    var candidates = ZotDupe.MinHash.lshCandidates(items);
    assertEq(candidates.length, 1, 'identical items should produce exactly one pair');
});

// ——— Summary ———

var summary = '\n=== test-minhash: ' + passed + ' passed, ' + failed + ' failed ===';
if (typeof Zotero !== 'undefined') {
    Zotero.debug(summary);
} else {
    console.log(summary);
}
if (failed > 0 && typeof process !== 'undefined') process.exit(1);
