/**
 * Tests for ZotDupe Normalization Utilities
 *
 * Self-contained — can be run in Zotero's JS console or Node.js.
 * In Node.js: node zotdupe/tests/test-normalize.js
 */

// Load the module under test when running in Node.js
if (typeof ZotDupe === 'undefined') {
    var ZotDupe = {};
    // Node.js: evaluate normalize.js in this scope
    var fs = require('fs');
    var path = require('path');
    var code = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'utils', 'normalize.js'), 'utf-8'
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

function approxEq(a, b, eps) {
    return Math.abs(a - b) < (eps || 0.001);
}

var N = ZotDupe.Normalize;

// ============================================================
// removeDiacritics
// ============================================================
assertEq(N.removeDiacritics('ăîâșț'), 'aiast', 'removeDiacritics: Romanian chars (5 chars: a,i,a,s,t)');
assertEq(N.removeDiacritics('ș'), 's', 'removeDiacritics: ș -> s');
assertEq(N.removeDiacritics('ț'), 't', 'removeDiacritics: ț -> t');
assertEq(N.removeDiacritics('café'), 'cafe', 'removeDiacritics: French accent');
assertEq(N.removeDiacritics('über'), 'uber', 'removeDiacritics: German umlaut');
assertEq(N.removeDiacritics('naïve'), 'naive', 'removeDiacritics: diaeresis');
assertEq(N.removeDiacritics('ABC'), 'ABC', 'removeDiacritics: no diacritics');
assertEq(N.removeDiacritics(''), '', 'removeDiacritics: empty string');
assertEq(N.removeDiacritics(null), '', 'removeDiacritics: null input');

// ============================================================
// normalizeTitle
// ============================================================
assertEq(
    N.normalizeTitle('The Quick Brown Fox!'),
    'quick brown fox',
    'normalizeTitle: strip article + punctuation'
);
assertEq(
    N.normalizeTitle('  A   Tale  of  Two  Cities  '),
    'tale of two cities',
    'normalizeTitle: collapse spaces + article removal'
);
assertEq(
    N.normalizeTitle('An Introduction to Algorithms'),
    'introduction to algorithms',
    'normalizeTitle: "an" article'
);
assertEq(
    N.normalizeTitle('Les Misérables'),
    'miserables',
    'normalizeTitle: French article + diacritics'
);
assertEq(
    N.normalizeTitle('La République'),
    'republique',
    'normalizeTitle: "la" article + diacritics'
);
assertEq(
    N.normalizeTitle('Le Petit Prince'),
    'petit prince',
    'normalizeTitle: "le" article'
);
assertEq(
    N.normalizeTitle('Un Om Bun'),
    'om bun',
    'normalizeTitle: "un" article'
);
assertEq(
    N.normalizeTitle('O Scrisoare Pierdută'),
    'scrisoare pierduta',
    'normalizeTitle: "o" article + diacritics'
);
assertEq(
    N.normalizeTitle('Lege privind protecția mediului'),
    'lege protectia mediului',
    'normalizeTitle: legal noise "privind"'
);
assertEq(
    N.normalizeTitle('Hotărâre referitor la impozite'),
    'hotarare impozite',
    'normalizeTitle: legal noise "referitor la"'
);
assertEq(
    N.normalizeTitle('Ordonanță pentru modificarea codului'),
    'ordonanta codului',
    'normalizeTitle: legal noise "pentru modificarea"'
);
assertEq(
    N.normalizeTitle('Lege cu privire la drepturile omului'),
    'lege drepturile omului',
    'normalizeTitle: legal noise "cu privire la"'
);
assertEq(
    N.normalizeTitle('Title: With—Dashes & Special «Chars»!'),
    'title withdashes special chars',
    'normalizeTitle: various special characters'
);
assertEq(N.normalizeTitle(''), '', 'normalizeTitle: empty');
assertEq(N.normalizeTitle(null), '', 'normalizeTitle: null');

// ============================================================
// normalizeDOI
// ============================================================
assertEq(
    N.normalizeDOI('https://doi.org/10.1000/TEST'),
    '10.1000/test',
    'normalizeDOI: https://doi.org/ prefix'
);
assertEq(
    N.normalizeDOI('http://dx.doi.org/10.1000/Test'),
    '10.1000/test',
    'normalizeDOI: http://dx.doi.org/ prefix'
);
assertEq(
    N.normalizeDOI('DOI:10.1000/Test'),
    '10.1000/test',
    'normalizeDOI: DOI: prefix (case insensitive)'
);
assertEq(
    N.normalizeDOI('doi:10.1000/Test'),
    '10.1000/test',
    'normalizeDOI: doi: prefix lowercase'
);
assertEq(
    N.normalizeDOI('  10.1000/Test  '),
    '10.1000/test',
    'normalizeDOI: whitespace trimming'
);
assertEq(
    N.normalizeDOI('https://dx.doi.org/10.1000/Test'),
    '10.1000/test',
    'normalizeDOI: https://dx.doi.org/ prefix'
);
assertEq(N.normalizeDOI(''), '', 'normalizeDOI: empty');
assertEq(N.normalizeDOI(null), '', 'normalizeDOI: null');

// ============================================================
// normalizeISBN
// ============================================================
// ISBN-13 passthrough
assertEq(
    N.normalizeISBN('978-3-16-148410-0'),
    '9783161484100',
    'normalizeISBN: ISBN-13 strip hyphens'
);
assertEq(
    N.normalizeISBN('978 3 16 148410 0'),
    '9783161484100',
    'normalizeISBN: ISBN-13 strip spaces'
);
// ISBN-10 to ISBN-13 conversion
// ISBN-10: 0-306-40615-2 -> ISBN-13: 9780306406157
assertEq(
    N.normalizeISBN('0-306-40615-2'),
    '9780306406157',
    'normalizeISBN: ISBN-10 to ISBN-13 conversion'
);
// ISBN-10: 0451526538 -> ISBN-13: 9780451526533
assertEq(
    N.normalizeISBN('0451526538'),
    '9780451526533',
    'normalizeISBN: ISBN-10 to ISBN-13 (no hyphens)'
);
assertEq(N.normalizeISBN(''), '', 'normalizeISBN: empty');
assertEq(N.normalizeISBN(null), '', 'normalizeISBN: null');

// ============================================================
// normalizeURL
// ============================================================
assertEq(
    N.normalizeURL('https://www.example.com/page?q=1#top'),
    'example.com/page',
    'normalizeURL: full cleanup'
);
assertEq(
    N.normalizeURL('http://example.com/path/'),
    'example.com/path',
    'normalizeURL: trailing slash'
);
assertEq(
    N.normalizeURL('https://example.com'),
    'example.com',
    'normalizeURL: protocol only'
);
assertEq(
    N.normalizeURL('http://www.example.com/'),
    'example.com',
    'normalizeURL: www + trailing slash'
);
assertEq(
    N.normalizeURL('https://example.com/path#section'),
    'example.com/path',
    'normalizeURL: fragment only'
);
assertEq(
    N.normalizeURL('https://example.com/path?a=1&b=2'),
    'example.com/path',
    'normalizeURL: query params only'
);
assertEq(N.normalizeURL(''), '', 'normalizeURL: empty');
assertEq(N.normalizeURL(null), '', 'normalizeURL: null');

// ============================================================
// normalizeAuthor
// ============================================================
assertEq(
    N.normalizeAuthor({ firstName: 'Ion', lastName: 'Popescu' }),
    'popescu',
    'normalizeAuthor: simple'
);
assertEq(
    N.normalizeAuthor({ firstName: 'Ioana', lastName: 'Ștefănescu' }),
    'stefanescu',
    'normalizeAuthor: Romanian diacritics'
);
assertEq(
    N.normalizeAuthor({ firstName: 'José', lastName: 'García' }),
    'garcia',
    'normalizeAuthor: Spanish diacritics'
);
assertEq(
    N.normalizeAuthor({ firstName: '', lastName: '' }),
    '',
    'normalizeAuthor: empty lastName'
);
assertEq(N.normalizeAuthor(null), '', 'normalizeAuthor: null');

// ============================================================
// jaccardSimilarity
// ============================================================
assertEq(
    N.jaccardSimilarity('hello world', 'hello world'),
    1.0,
    'jaccard: identical'
);
assertEq(
    N.jaccardSimilarity('cat', 'dog'),
    0,
    'jaccard: disjoint'
);
assert(
    approxEq(N.jaccardSimilarity('the cat sat', 'the cat'), 2 / 3),
    'jaccard: partial overlap (2/3)'
);
assert(
    approxEq(N.jaccardSimilarity('a b c', 'b c d'), 0.5),
    'jaccard: partial overlap (0.5)'
);
assertEq(
    N.jaccardSimilarity('', ''),
    1.0,
    'jaccard: both empty -> 1.0'
);
assertEq(
    N.jaccardSimilarity('hello', ''),
    0,
    'jaccard: one empty -> 0'
);
assertEq(
    N.jaccardSimilarity('', 'hello'),
    0,
    'jaccard: other empty -> 0'
);
// Duplicate words should not affect result (set semantics)
assertEq(
    N.jaccardSimilarity('a a a', 'a'),
    1.0,
    'jaccard: duplicate words'
);

// ============================================================
// levenshteinDistance
// ============================================================
assertEq(N.levenshteinDistance('kitten', 'sitting'), 3, 'levenshtein: kitten->sitting');
assertEq(N.levenshteinDistance('', ''), 0, 'levenshtein: both empty');
assertEq(N.levenshteinDistance('abc', ''), 3, 'levenshtein: a empty');
assertEq(N.levenshteinDistance('', 'abc'), 3, 'levenshtein: b empty');
assertEq(N.levenshteinDistance('same', 'same'), 0, 'levenshtein: identical');
assertEq(N.levenshteinDistance('abc', 'xyz'), 3, 'levenshtein: completely different');
assertEq(N.levenshteinDistance('a', 'b'), 1, 'levenshtein: single char substitution');
assertEq(N.levenshteinDistance('ab', 'a'), 1, 'levenshtein: single deletion');
assertEq(N.levenshteinDistance('a', 'ab'), 1, 'levenshtein: single insertion');

// ============================================================
// normalizedLevenshtein
// ============================================================
assertEq(N.normalizedLevenshtein('same', 'same'), 1.0, 'normLev: identical -> 1.0');
assertEq(N.normalizedLevenshtein('', ''), 1.0, 'normLev: both empty -> 1.0');
assertEq(N.normalizedLevenshtein('abc', 'xyz'), 0, 'normLev: completely different -> 0');
assert(
    approxEq(N.normalizedLevenshtein('kitten', 'sitting'), 1 - 3 / 7),
    'normLev: kitten/sitting'
);
assert(
    approxEq(N.normalizedLevenshtein('ab', 'a'), 0.5),
    'normLev: ab/a -> 0.5'
);
assertEq(N.normalizedLevenshtein('a', ''), 0, 'normLev: one empty -> 0');

console.log('All normalize tests passed!');
