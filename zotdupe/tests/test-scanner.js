/**
 * Tests for ZotDupe Scanner — All 7 Layers
 *
 * Self-contained — can be run in Zotero's JS console or Node.js.
 * In Node.js: node zotdupe/tests/test-scanner.js
 */

// Load dependencies when running in Node.js
if (typeof ZotDupe === 'undefined') {
    var ZotDupe = {};
    var fs = require('fs');
    var path = require('path');
    // Load normalize.js
    eval(fs.readFileSync(
        path.join(__dirname, '..', 'src', 'utils', 'normalize.js'), 'utf-8'
    ));
    // Load legal-fingerprint.js
    eval(fs.readFileSync(
        path.join(__dirname, '..', 'src', 'legal-fingerprint.js'), 'utf-8'
    ));
    // Load scanner.js
    eval(fs.readFileSync(
        path.join(__dirname, '..', 'src', 'scanner.js'), 'utf-8'
    ));
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

var S = ZotDupe.Scanner;

// ============================================================
// Layer 1 — Exact Identifiers
// ============================================================
(function testLayer1() {
    // DOI match (with different prefix formats)
    assertEq(S.scoreLayer1(
        {DOI: 'https://doi.org/10.1234/abc'},
        {DOI: '10.1234/abc'}
    ), 1.0, 'L1: DOI match with prefix vs bare');

    // DOI mismatch
    assertEq(S.scoreLayer1(
        {DOI: '10.1234/abc'},
        {DOI: '10.1234/xyz'}
    ), 0.0, 'L1: DOI mismatch');

    // PMID match
    assertEq(S.scoreLayer1(
        {PMID: '12345678'},
        {PMID: ' 12345678 '}
    ), 1.0, 'L1: PMID match with whitespace');

    // PMCID match
    assertEq(S.scoreLayer1(
        {PMCID: 'PMC1234567'},
        {PMCID: 'PMC1234567'}
    ), 1.0, 'L1: PMCID match');

    // ISBN match (ISBN-10 vs ISBN-13)
    assertEq(S.scoreLayer1(
        {ISBN: '0-306-40615-2'},
        {ISBN: '978-0-306-40615-7'}
    ), 1.0, 'L1: ISBN-10 vs ISBN-13 match');

    // No identifiers at all → null
    assertEq(S.scoreLayer1({}, {}), null, 'L1: no identifiers → null');

    // One has DOI, other has none → null (no pair to compare)
    assertEq(S.scoreLayer1({DOI: '10.1234/abc'}, {}), null,
        'L1: one DOI, other empty → null');

    // Different identifier types, no overlap
    assertEq(S.scoreLayer1({DOI: '10.1234/abc'}, {PMID: '999'}), null,
        'L1: DOI vs PMID only → null (no same-type pair)');

    // DOI mismatch but ISBN match → 1.0
    assertEq(S.scoreLayer1(
        {DOI: '10.1234/abc', ISBN: '9780306406157'},
        {DOI: '10.1234/xyz', ISBN: '978-0-306-40615-7'}
    ), 1.0, 'L1: DOI mismatch but ISBN match → 1.0');

    console.log('Layer 1: all tests passed');
})();

// ============================================================
// Layer 2 — Normalized Title + Year
// ============================================================
(function testLayer2() {
    // Identical title, same year
    assertEq(S.scoreLayer2(
        {title: 'Machine Learning for Healthcare', date: '2020'},
        {title: 'Machine Learning for Healthcare', date: '2020'}
    ), 0.95, 'L2: identical title, same year');

    // Identical title, year differs by 1
    assertEq(S.scoreLayer2(
        {title: 'Machine Learning for Healthcare', date: '2020'},
        {title: 'Machine Learning for Healthcare', date: '2021'}
    ), 0.95, 'L2: identical title, year ±1');

    // Identical title, year missing
    assertEq(S.scoreLayer2(
        {title: 'Machine Learning for Healthcare', date: '2020'},
        {title: 'Machine Learning for Healthcare'}
    ), 0.85, 'L2: identical title, year missing');

    // Identical title, years differ >1
    assertEq(S.scoreLayer2(
        {title: 'Machine Learning for Healthcare', date: '2020'},
        {title: 'Machine Learning for Healthcare', date: '2015'}
    ), 0.70, 'L2: identical title, years far apart');

    // Very similar title (Jaccard >= 0.90), same year
    // 10 words, 9 shared → Jaccard = 9/11 = 0.818 — not enough
    // Need: intersection/union >= 0.90
    // 20 words shared, 1 extra → 20/21 = 0.952
    assertEq(S.scoreLayer2(
        {title: 'w1 w2 w3 w4 w5 w6 w7 w8 w9 w10 w11 w12 w13 w14 w15 w16 w17 w18 w19 w20', date: '2021'},
        {title: 'w1 w2 w3 w4 w5 w6 w7 w8 w9 w10 w11 w12 w13 w14 w15 w16 w17 w18 w19 w20 extra', date: '2021'}
    ), 0.85, 'L2: Jaccard>=0.90, same year');

    // Very similar title, year missing
    assertEq(S.scoreLayer2(
        {title: 'w1 w2 w3 w4 w5 w6 w7 w8 w9 w10 w11 w12 w13 w14 w15 w16 w17 w18 w19 w20', date: '2021'},
        {title: 'w1 w2 w3 w4 w5 w6 w7 w8 w9 w10 w11 w12 w13 w14 w15 w16 w17 w18 w19 w20 extra'}
    ), 0.75, 'L2: Jaccard>=0.90, year missing');

    // Moderately similar (Jaccard >= 0.80), same year
    // 'a b c d e f g h i j' vs 'a b c d e f g h i k' → intersection=9, union=11 → 0.818
    assertEq(S.scoreLayer2(
        {title: 'a b c d e f g h i j', date: '2020'},
        {title: 'a b c d e f g h i k', date: '2020'}
    ), 0.70, 'L2: Jaccard>=0.80, same year');

    // Completely different titles
    assertEq(S.scoreLayer2(
        {title: 'Quantum Physics', date: '2020'},
        {title: 'Medieval History', date: '2020'}
    ), 0.0, 'L2: different titles');

    // Empty title
    assertEq(S.scoreLayer2(
        {title: ''},
        {title: 'Something'}
    ), 0.0, 'L2: empty title');

    console.log('Layer 2: all tests passed');
})();

// ============================================================
// Layer 3 — Authors
// ============================================================
(function testLayer3() {
    // Identical authors
    assert(approxEq(S.scoreLayer3(
        {creators: [{lastName: 'Smith'}, {lastName: 'Jones'}]},
        {creators: [{lastName: 'Smith'}, {lastName: 'Jones'}]}
    ), 1.0), 'L3: identical authors → 1.0');

    // Partial overlap
    assert(approxEq(S.scoreLayer3(
        {creators: [{lastName: 'Smith'}, {lastName: 'Jones'}, {lastName: 'Brown'}]},
        {creators: [{lastName: 'Smith'}, {lastName: 'Jones'}]}
    ), 2 / 3), 'L3: partial overlap → 2/3');

    // No overlap
    assertEq(S.scoreLayer3(
        {creators: [{lastName: 'Smith'}]},
        {creators: [{lastName: 'Brown'}]}
    ), 0.0, 'L3: no overlap → 0.0');

    // No creators on one side → null
    assertEq(S.scoreLayer3(
        {creators: [{lastName: 'Smith'}]},
        {creators: []}
    ), null, 'L3: empty creators → null');

    assertEq(S.scoreLayer3(
        {creators: [{lastName: 'Smith'}]},
        {}
    ), null, 'L3: missing creators → null');

    // Diacritics normalization
    assert(approxEq(S.scoreLayer3(
        {creators: [{lastName: 'Müller'}]},
        {creators: [{lastName: 'Muller'}]}
    ), 1.0), 'L3: diacritics → match');

    console.log('Layer 3: all tests passed');
})();

// ============================================================
// Layer 4 — Legal Fingerprint
// ============================================================
(function testLayer4() {
    // Same law
    assertEq(S.scoreLayer4(
        {title: 'Legea nr. 123/2020 privind protectia mediului'},
        {title: 'Legea 123/2020 privind mediul'}
    ), 0.95, 'L4: same law → 0.95');

    // Same type, different number
    assertEq(S.scoreLayer4(
        {title: 'Legea nr. 123/2020'},
        {title: 'Legea nr. 456/2020'}
    ), 0.0, 'L4: same type, different number → 0.0');

    // No legal fingerprint
    assertEq(S.scoreLayer4(
        {title: 'Machine Learning Review'},
        {title: 'Deep Learning Survey'}
    ), null, 'L4: no legal docs → null');

    // One legal, one not → null
    assertEq(S.scoreLayer4(
        {title: 'Legea nr. 123/2020'},
        {title: 'Machine Learning Review'}
    ), null, 'L4: one legal, one not → null');

    console.log('Layer 4: all tests passed');
})();

// ============================================================
// Layer 5 — URL
// ============================================================
(function testLayer5() {
    // Identical URLs (different protocols)
    assertEq(S.scoreLayer5(
        {url: 'https://example.com/page'},
        {url: 'http://example.com/page'}
    ), 0.95, 'L5: identical normalized URL → 0.95');

    // Same domain, different path
    assertEq(S.scoreLayer5(
        {url: 'https://example.com/page1'},
        {url: 'https://example.com/page2'}
    ), 0.80, 'L5: same domain → 0.80');

    // Different domains
    assertEq(S.scoreLayer5(
        {url: 'https://example.com/page'},
        {url: 'https://other.com/page'}
    ), 0.0, 'L5: different domains → 0.0');

    // Missing URL → null
    assertEq(S.scoreLayer5(
        {url: 'https://example.com'},
        {}
    ), null, 'L5: missing URL → null');

    // Trailing slash and query params ignored
    assertEq(S.scoreLayer5(
        {url: 'https://example.com/page?ref=1'},
        {url: 'https://example.com/page/'}
    ), 0.95, 'L5: query params and trailing slash ignored');

    console.log('Layer 5: all tests passed');
})();

// ============================================================
// Layer 6 — Preprint ↔ Journal Article
// ============================================================
(function testLayer6() {
    // Preprint + journalArticle, same title, same first author
    assertEq(S.scoreLayer6(
        {title: 'Attention Is All You Need', itemType: 'preprint',
         creators: [{lastName: 'Vaswani'}]},
        {title: 'Attention Is All You Need', itemType: 'journalArticle',
         creators: [{lastName: 'Vaswani'}]}
    ), 0.90, 'L6: preprint+journal, same title, same author → 0.90');

    // Preprint via URL + journalArticle, same title, different first author
    assertEq(S.scoreLayer6(
        {title: 'Attention Is All You Need', itemType: 'webpage',
         url: 'https://arxiv.org/abs/1706.03762',
         creators: [{lastName: 'Smith'}]},
        {title: 'Attention Is All You Need', itemType: 'journalArticle',
         creators: [{lastName: 'Jones'}]}
    ), 0.70, 'L6: arxiv URL + journal, diff author → 0.70');

    // Both journal articles → null
    assertEq(S.scoreLayer6(
        {title: 'Some Paper', itemType: 'journalArticle'},
        {title: 'Some Paper', itemType: 'journalArticle'}
    ), null, 'L6: both journal → null');

    // Low title similarity → 0.0
    assertEq(S.scoreLayer6(
        {title: 'Completely Different Topic', itemType: 'preprint',
         creators: [{lastName: 'Smith'}]},
        {title: 'Unrelated Paper About Cars', itemType: 'journalArticle',
         creators: [{lastName: 'Smith'}]}
    ), 0.0, 'L6: low similarity → 0.0');

    // biorxiv URL detection
    assertEq(S.scoreLayer6(
        {title: 'Gene Expression Study', itemType: 'webpage',
         url: 'https://biorxiv.org/content/123',
         creators: [{lastName: 'Wang'}]},
        {title: 'Gene Expression Study', itemType: 'journalArticle',
         creators: [{lastName: 'Wang'}]}
    ), 0.90, 'L6: biorxiv URL detected as preprint');

    // No first author on one side
    assertEq(S.scoreLayer6(
        {title: 'Attention Is All You Need', itemType: 'preprint', creators: []},
        {title: 'Attention Is All You Need', itemType: 'journalArticle',
         creators: [{lastName: 'Vaswani'}]}
    ), 0.70, 'L6: missing first author → 0.70');

    console.log('Layer 6: all tests passed');
})();

// ============================================================
// Layer 7 — Translations
// ============================================================
(function testLayer7() {
    // Different languages, authors match, same year, same journal → 0.70
    var result = S.scoreLayer7(
        {language: 'en', creators: [{lastName: 'Smith'}], date: '2020',
         publicationTitle: 'Journal of Science'},
        {language: 'ro', creators: [{lastName: 'Smith'}], date: '2020',
         publicationTitle: 'Journal of Science'}
    );
    assertEq(result, 0.70, 'L7: all signals → 0.70 (capped)');

    // Different languages, authors match, same year, different journal → 0.50
    result = S.scoreLayer7(
        {language: 'en', creators: [{lastName: 'Smith'}], date: '2020',
         publicationTitle: 'Journal A'},
        {language: 'ro', creators: [{lastName: 'Smith'}], date: '2020',
         publicationTitle: 'Journal B'}
    );
    assertEq(result, 0.50, 'L7: authors + year → 0.50');

    // Different languages, authors match only → 0.30
    result = S.scoreLayer7(
        {language: 'en', creators: [{lastName: 'Smith'}], date: '2020'},
        {language: 'fr', creators: [{lastName: 'Smith'}], date: '2015'}
    );
    assertEq(result, 0.30, 'L7: authors only → 0.30');

    // Different languages, nothing matches → 0.0
    result = S.scoreLayer7(
        {language: 'en', creators: [{lastName: 'Smith'}], date: '2020'},
        {language: 'ro', creators: [{lastName: 'Jones'}], date: '2015'}
    );
    assertEq(result, 0.0, 'L7: nothing matches → 0.0');

    // Same language → null
    assertEq(S.scoreLayer7(
        {language: 'en'},
        {language: 'en'}
    ), null, 'L7: same language → null');

    // Missing language → null
    assertEq(S.scoreLayer7(
        {language: 'en'},
        {}
    ), null, 'L7: missing language → null');

    // Year match only (no author match) → 0.20 < 0.30 → 0.0
    result = S.scoreLayer7(
        {language: 'en', creators: [{lastName: 'Alpha'}], date: '2020'},
        {language: 'de', creators: [{lastName: 'Beta'}], date: '2020'}
    );
    assertEq(result, 0.0, 'L7: year only (below threshold) → 0.0');

    console.log('Layer 7: all tests passed');
})();

// ============================================================
// scanPair — integration
// ============================================================
(function testScanPair() {
    // DOI match
    var r = S.scanPair(
        {DOI: '10.1234/abc', title: 'Paper X', date: '2020'},
        {DOI: '10.1234/abc', title: 'Paper X', date: '2020'}
    );
    assertEq(r.matchType, 'Identical DOI', 'scanPair: DOI match type');
    assertEq(r.scores.layer1, 1.0, 'scanPair: DOI score');

    // ISBN match (no DOI)
    r = S.scanPair(
        {ISBN: '978-0-306-40615-7', title: 'Book X', date: '2020'},
        {ISBN: '0-306-40615-2', title: 'Book X', date: '2020'}
    );
    assertEq(r.matchType, 'Identical ISBN', 'scanPair: ISBN match type');

    // PMID match
    r = S.scanPair(
        {PMID: '99999', title: 'Study Y', date: '2020'},
        {PMID: '99999', title: 'Study Y', date: '2020'}
    );
    assertEq(r.matchType, 'Identical PMID', 'scanPair: PMID match type');

    // Title + year only (no identifiers)
    r = S.scanPair(
        {title: 'Neural Network Applications', date: '2021'},
        {title: 'Neural Network Applications', date: '2021'}
    );
    assertEq(r.matchType, 'Similar title + year', 'scanPair: title+year match type');
    assertEq(r.scores.layer2, 0.95, 'scanPair: title+year score');

    // Legal fingerprint
    r = S.scanPair(
        {title: 'Legea nr. 50/2020 privind constructiile'},
        {title: 'Legea 50/2020 despre constructii'}
    );
    assertEq(r.scores.layer4, 0.95, 'scanPair: legal fingerprint score');

    // URL match
    r = S.scanPair(
        {title: 'Different Title A', url: 'https://example.com/paper'},
        {title: 'Different Title B', url: 'http://example.com/paper'}
    );
    assertEq(r.matchType, 'Identical URL', 'scanPair: URL match type');

    // Preprint detection
    r = S.scanPair(
        {title: 'Transformer Architecture', itemType: 'preprint',
         creators: [{lastName: 'Doe'}]},
        {title: 'Transformer Architecture', itemType: 'journalArticle',
         creators: [{lastName: 'Doe'}]}
    );
    assertEq(r.scores.layer6, 0.90, 'scanPair: preprint score');

    // Disable preprint detection
    r = S.scanPair(
        {title: 'Transformer Architecture', itemType: 'preprint',
         creators: [{lastName: 'Doe'}]},
        {title: 'Transformer Architecture', itemType: 'journalArticle',
         creators: [{lastName: 'Doe'}]},
        {enablePreprintDetection: false}
    );
    assertEq(r.scores.layer6, null, 'scanPair: preprint disabled → null');

    // Disable legal fingerprint
    r = S.scanPair(
        {title: 'Legea nr. 50/2020'},
        {title: 'Legea 50/2020'},
        {enableLegalFingerprint: false}
    );
    assertEq(r.scores.layer4, null, 'scanPair: legal disabled → null');

    // Translation detection
    r = S.scanPair(
        {title: 'Completely different', language: 'en', date: '2020',
         creators: [{lastName: 'Smith'}]},
        {title: 'Totally unrelated', language: 'ro', date: '2020',
         creators: [{lastName: 'Smith'}]}
    );
    assert(r.scores.layer7 !== null, 'scanPair: translation layer ran');

    // Disable translation
    r = S.scanPair(
        {title: 'X', language: 'en'},
        {title: 'Y', language: 'ro'},
        {enableTranslationDetection: false}
    );
    assertEq(r.scores.layer7, null, 'scanPair: translation disabled → null');

    // All scores returned
    r = S.scanPair({title: 'Hello'}, {title: 'World'});
    assert('layer1' in r.scores, 'scanPair: has layer1');
    assert('layer2' in r.scores, 'scanPair: has layer2');
    assert('layer3' in r.scores, 'scanPair: has layer3');
    assert('layer4' in r.scores, 'scanPair: has layer4');
    assert('layer5' in r.scores, 'scanPair: has layer5');
    assert('layer6' in r.scores, 'scanPair: has layer6');
    assert('layer7' in r.scores, 'scanPair: has layer7');

    console.log('scanPair: all tests passed');
})();

console.log('All scanner tests passed!');
