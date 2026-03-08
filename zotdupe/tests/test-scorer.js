/**
 * Tests for ZotDupe Composite Scorer
 *
 * Run with: node zotdupe/tests/test-scorer.js
 */

// Bootstrap the ZotDupe namespace
var ZotDupe = {};

// Load scorer
eval(require('fs').readFileSync(__dirname + '/../src/scorer.js', 'utf8'));

var computeScore     = ZotDupe.Scorer.computeScore;
var classify         = ZotDupe.Scorer.classify;
var getThresholdValue = ZotDupe.Scorer.getThresholdValue;

var passed = 0;
var failed = 0;

function assert(condition, message) {
    if (condition) {
        passed++;
    } else {
        failed++;
        console.error('FAIL: ' + message);
    }
}

function assertApprox(actual, expected, tolerance, message) {
    var diff = Math.abs(actual - expected);
    if (diff <= (tolerance || 0.001)) {
        passed++;
    } else {
        failed++;
        console.error('FAIL: ' + message + ' (expected ~' + expected + ', got ' + actual + ')');
    }
}

// ---- computeScore tests ----

console.log('=== computeScore ===');

// DOI match dominates: layer1=1.0 -> score >= 0.95
(function () {
    var score = computeScore({ layer1: 1.0 });
    assert(score >= 0.95, 'DOI exact match should yield score >= 0.95, got ' + score);
    assertApprox(score, 0.95, 0.001, 'DOI exact match should be 1.0 * 0.95 = 0.95');
})();

// Legal fingerprint dominates: layer4=0.95 -> score >= 0.85
(function () {
    var score = computeScore({ layer4: 0.95 });
    assert(score >= 0.85, 'Legal fingerprint 0.95 should yield score >= 0.85, got ' + score);
    assertApprox(score, 0.95 * 0.90, 0.001, 'Legal fingerprint: 0.95 * 0.90 = 0.855');
})();

// Combined title + author + URL
(function () {
    var score = computeScore({ layer2: 0.90, layer3: 0.85, layer5: 0.70 });
    // combined = (0.90*0.50 + 0.85*0.25 + 0.70*0.15) / (0.50+0.25+0.15)
    //          = (0.45 + 0.2125 + 0.105) / 0.90
    //          = 0.7675 / 0.90
    //          = 0.85278
    var expected = (0.90 * 0.50 + 0.85 * 0.25 + 0.70 * 0.15) / (0.50 + 0.25 + 0.15);
    assertApprox(score, expected, 0.001, 'Combined title+author+URL should be ~' + expected.toFixed(4));
})();

// Preprint detection: layer6=0.85 -> score >= 0.70
(function () {
    var score = computeScore({ layer6: 0.85 });
    assert(score >= 0.70, 'Preprint detection 0.85 should yield score >= 0.70, got ' + score);
    assertApprox(score, 0.85 * 0.85, 0.001, 'Preprint: 0.85 * 0.85 = 0.7225');
})();

// Translation low ceiling: layer7=0.70 -> score <= 0.70
(function () {
    var score = computeScore({ layer7: 0.70 });
    assert(score <= 0.70, 'Translation 0.70 should yield score <= 0.70, got ' + score);
    assertApprox(score, 0.70 * 0.60, 0.001, 'Translation: 0.70 * 0.60 = 0.42');
})();

// Null layers are properly excluded
(function () {
    // With layer3 null, combined = (layer2*0.50 + layer5*0.15) / (0.50+0.15)
    var score = computeScore({ layer2: 0.80, layer3: null, layer5: 0.60 });
    var expected = (0.80 * 0.50 + 0.60 * 0.15) / (0.50 + 0.15);
    assertApprox(score, expected, 0.001, 'Null layer3 excluded: combined = ' + expected.toFixed(4));
})();

(function () {
    // Only layer2 present among combined layers
    var score = computeScore({ layer2: 0.90 });
    var expected = 0.90; // (0.90 * 0.50) / 0.50 = 0.90
    assertApprox(score, expected, 0.001, 'Only layer2: combined = layer2 = 0.90');
})();

// Edge case: all nulls -> 0
(function () {
    var score = computeScore({});
    assert(score === 0, 'All nulls should yield 0, got ' + score);
})();

(function () {
    var score = computeScore({ layer1: null, layer2: null, layer3: null, layer4: null, layer5: null, layer6: null, layer7: null });
    assert(score === 0, 'Explicit all-null should yield 0, got ' + score);
})();

// Max of multiple strategies
(function () {
    var score = computeScore({ layer1: 1.0, layer2: 0.90, layer3: 0.85, layer7: 0.50 });
    // DOI dominates: 1.0 * 0.95 = 0.95
    assertApprox(score, 0.95, 0.001, 'DOI should dominate when present with other layers');
})();

// ---- classify tests ----

console.log('=== classify ===');

// Strict threshold (0.90)
(function () {
    assert(classify(0.89, 'strict') === 'none',     'strict: 0.89 -> none');
    assert(classify(0.90, 'strict') === 'probable',  'strict: 0.90 -> probable');
    assert(classify(0.95, 'strict') === 'sure',      'strict: 0.95 -> sure');
    assert(classify(0.80, 'strict') === 'none',      'strict: 0.80 -> none');
})();

// Balanced threshold (0.75)
(function () {
    assert(classify(0.74, 'balanced') === 'none',     'balanced: 0.74 -> none');
    assert(classify(0.75, 'balanced') === 'possible',  'balanced: 0.75 -> possible');
    assert(classify(0.80, 'balanced') === 'probable',  'balanced: 0.80 -> probable');
    assert(classify(0.96, 'balanced') === 'sure',      'balanced: 0.96 -> sure');
})();

// Relaxed threshold (0.60)
(function () {
    assert(classify(0.59, 'relaxed') === 'none',     'relaxed: 0.59 -> none');
    assert(classify(0.60, 'relaxed') === 'possible',  'relaxed: 0.60 -> possible');
    assert(classify(0.79, 'relaxed') === 'possible',  'relaxed: 0.79 -> possible');
    assert(classify(0.85, 'relaxed') === 'probable',  'relaxed: 0.85 -> probable');
    assert(classify(0.99, 'relaxed') === 'sure',      'relaxed: 0.99 -> sure');
})();

// ---- getThresholdValue tests ----

console.log('=== getThresholdValue ===');

(function () {
    assert(getThresholdValue('strict')   === 0.90, 'strict threshold = 0.90');
    assert(getThresholdValue('balanced') === 0.75, 'balanced threshold = 0.75');
    assert(getThresholdValue('relaxed')  === 0.60, 'relaxed threshold = 0.60');
})();

(function () {
    var threw = false;
    try { getThresholdValue('unknown'); } catch (e) { threw = true; }
    assert(threw, 'Unknown threshold should throw');
})();

// ---- Summary ----

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
    process.exit(1);
} else {
    console.log('All tests passed.');
}
