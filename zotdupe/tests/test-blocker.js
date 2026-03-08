/**
 * Tests for ZotDupe Blocking Strategy
 *
 * Run with: node zotdupe/tests/test-blocker.js
 */

// Bootstrap the ZotDupe namespace
var ZotDupe = {};

// Load dependencies
eval(require('fs').readFileSync(__dirname + '/../src/utils/normalize.js', 'utf8'));
eval(require('fs').readFileSync(__dirname + '/../src/legal-fingerprint.js', 'utf8'));
eval(require('fs').readFileSync(__dirname + '/../src/blocker.js', 'utf8'));

var generateBlockingKeys = ZotDupe.Blocker.generateBlockingKeys;
var buildBlocks = ZotDupe.Blocker.buildBlocks;
var getCandidatePairs = ZotDupe.Blocker.getCandidatePairs;
var extractYear = ZotDupe.Blocker.extractYear;
var first3SignificantWords = ZotDupe.Blocker.first3SignificantWords;

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

function assert(label, actual, expected) {
    if (deepEqual(actual, expected)) {
        passed++;
        console.log("PASS: " + label);
    } else {
        failed++;
        console.log("FAIL: " + label);
        console.log("  Expected:", JSON.stringify(expected));
        console.log("  Actual:  ", JSON.stringify(actual));
    }
}

function assertBool(label, actual, expected) {
    if (actual === expected) {
        passed++;
        console.log("PASS: " + label);
    } else {
        failed++;
        console.log("FAIL: " + label);
        console.log("  Expected:", expected);
        console.log("  Actual:  ", actual);
    }
}

function assertIncludes(label, arr, value) {
    var found = false;
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] === value) { found = true; break; }
    }
    if (found) {
        passed++;
        console.log("PASS: " + label);
    } else {
        failed++;
        console.log("FAIL: " + label);
        console.log("  Expected array to include:", JSON.stringify(value));
        console.log("  Array:  ", JSON.stringify(arr));
    }
}

function assertNotIncludes(label, arr, value) {
    var found = false;
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] === value) { found = true; break; }
    }
    if (!found) {
        passed++;
        console.log("PASS: " + label);
    } else {
        failed++;
        console.log("FAIL: " + label);
        console.log("  Expected array NOT to include:", JSON.stringify(value));
        console.log("  Array:  ", JSON.stringify(arr));
    }
}

// =====================================================================
// Helper tests
// =====================================================================
console.log("\n--- extractYear ---");

assert("extractYear: standard date", extractYear("2023-05-15"), "2023");
assert("extractYear: just year", extractYear("2019"), "2019");
assert("extractYear: no year", extractYear("March"), "");
assert("extractYear: null", extractYear(null), "");
assert("extractYear: embedded year", extractYear("Published in 2021 by..."), "2021");

console.log("\n--- first3SignificantWords ---");

assert("first3Words: three words", first3SignificantWords("introduction machine learning"), "introduction+machine+learning");
assert("first3Words: more than three", first3SignificantWords("introduction machine learning algorithms overview"), "introduction+machine+learning");
assert("first3Words: fewer than three", first3SignificantWords("introduction"), "introduction");
assert("first3Words: two words", first3SignificantWords("hello world"), "hello+world");
assert("first3Words: empty", first3SignificantWords(""), "");
assert("first3Words: null", first3SignificantWords(null), "");

// =====================================================================
// generateBlockingKeys tests
// =====================================================================
console.log("\n--- generateBlockingKeys ---");

// Item with DOI, title, year, and author
(function () {
    var item = {
        id: 1,
        title: "Introduction to Machine Learning Algorithms",
        DOI: "10.1234/test.5678",
        ISBN: "",
        date: "2023-05-15",
        creators: [{firstName: "John", lastName: "Smith"}],
        itemType: "journalArticle"
    };
    var keys = generateBlockingKeys(item);
    assertIncludes("full item: DOI key", keys, "doi:10.1234/test.5678");
    assertIncludes("full item: title3 key with year", keys, "title3:introduction+to+machine|2023");
    assertIncludes("full item: author key", keys, "author:smith|2023");
    assertNotIncludes("full item: no ISBN key", keys, "isbn:");
})();

// Item with DOI URL prefix
(function () {
    var item = {
        id: 2,
        title: "Some Paper",
        DOI: "https://doi.org/10.1234/TEST.5678",
        date: "2020",
        creators: [],
        itemType: "journalArticle"
    };
    var keys = generateBlockingKeys(item);
    assertIncludes("DOI URL prefix stripped and lowercased", keys, "doi:10.1234/test.5678");
})();

// Legal item gets fingerprint key
(function () {
    var item = {
        id: 3,
        title: "Legea nr. 123/2005 privind protectia mediului",
        DOI: "",
        ISBN: "",
        date: "2005",
        creators: [],
        itemType: "statute"
    };
    var keys = generateBlockingKeys(item);
    assertIncludes("legal item: legal fingerprint key", keys, "legal:LEGE:123:2005");
    // Should also have a title key
    var hasTitleKey = false;
    for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf("title3:") === 0) { hasTitleKey = true; break; }
    }
    assertBool("legal item: also has title key", hasTitleKey, true);
})();

// Item with no DOI/ISBN still gets title and author keys
(function () {
    var item = {
        id: 4,
        title: "Advanced Data Structures and Algorithms",
        DOI: "",
        ISBN: "",
        date: "2019",
        creators: [{firstName: "Jane", lastName: "Doe"}],
        itemType: "book"
    };
    var keys = generateBlockingKeys(item);
    assertIncludes("no DOI/ISBN: title key present", keys, "title3:advanced+data+structures|2019");
    assertIncludes("no DOI/ISBN: author key present", keys, "author:doe|2019");

    var hasDOI = false;
    var hasISBN = false;
    for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf("doi:") === 0) hasDOI = true;
        if (keys[i].indexOf("isbn:") === 0) hasISBN = true;
    }
    assertBool("no DOI/ISBN: no doi key", hasDOI, false);
    assertBool("no DOI/ISBN: no isbn key", hasISBN, false);
})();

// Item with ISBN
(function () {
    var item = {
        id: 5,
        title: "Some Book",
        DOI: "",
        ISBN: "978-0-13-468599-1",
        date: "2018",
        creators: [{firstName: "Bob", lastName: "Builder"}],
        itemType: "book"
    };
    var keys = generateBlockingKeys(item);
    assertIncludes("ISBN item: isbn key", keys, "isbn:9780134685991");
})();

// Item with no year — title key without year, no author key
(function () {
    var item = {
        id: 6,
        title: "Timeless Knowledge Base",
        DOI: "",
        ISBN: "",
        date: "",
        creators: [{firstName: "Alice", lastName: "Wonder"}],
        itemType: "journalArticle"
    };
    var keys = generateBlockingKeys(item);
    assertIncludes("no year: title key without year", keys, "title3:timeless+knowledge+base");
    // No author key because year is required for author blocking
    var hasAuthor = false;
    for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf("author:") === 0) hasAuthor = true;
    }
    assertBool("no year: no author key (year required)", hasAuthor, false);
})();

// Empty/null item produces minimal keys
(function () {
    var keys1 = generateBlockingKeys({id: 7, title: "", DOI: "", ISBN: "", date: "", creators: []});
    assert("empty item: no keys", keys1, []);

    var keys2 = generateBlockingKeys(null);
    assert("null item: no keys", keys2, []);

    var keys3 = generateBlockingKeys({id: 8});
    assert("minimal item: no keys", keys3, []);
})();

// =====================================================================
// buildBlocks tests
// =====================================================================
console.log("\n--- buildBlocks ---");

(function () {
    var items = [
        {id: 'A', title: "Introduction to Machine Learning", DOI: "10.1234/ml", date: "2020", creators: [{firstName: "J", lastName: "Smith"}]},
        {id: 'B', title: "Introduction to Machine Learning", DOI: "10.1234/ml", date: "2020", creators: [{firstName: "J", lastName: "Smith"}]},
        {id: 'C', title: "Completely Different Topic Here", DOI: "", date: "2021", creators: [{firstName: "X", lastName: "Other"}]}
    ];
    var blocks = buildBlocks(items);

    // A and B share DOI key
    var doiBlock = blocks.get('doi:10.1234/ml');
    assertBool("buildBlocks: DOI block has A", doiBlock && doiBlock.has('A'), true);
    assertBool("buildBlocks: DOI block has B", doiBlock && doiBlock.has('B'), true);
    assertBool("buildBlocks: DOI block does not have C", doiBlock && !doiBlock.has('C'), true);

    // A and B share title key
    var titleBlock = blocks.get('title3:introduction+to+machine|2020');
    assertBool("buildBlocks: title block has A", titleBlock && titleBlock.has('A'), true);
    assertBool("buildBlocks: title block has B", titleBlock && titleBlock.has('B'), true);

    // C has its own title block
    var cTitleBlock = blocks.get('title3:completely+different+topic|2021');
    assertBool("buildBlocks: C title block exists", cTitleBlock && cTitleBlock.has('C'), true);
    assert("buildBlocks: C title block size 1", cTitleBlock ? cTitleBlock.size : 0, 1);
})();

// =====================================================================
// getCandidatePairs tests
// =====================================================================
console.log("\n--- getCandidatePairs ---");

(function () {
    // Items A and B share two blocking keys (DOI and title).
    // The pair should only appear once.
    var items = [
        {id: 'A', title: "Introduction to Machine Learning", DOI: "10.1234/ml", date: "2020", creators: [{firstName: "J", lastName: "Smith"}]},
        {id: 'B', title: "Introduction to Machine Learning", DOI: "10.1234/ml", date: "2020", creators: [{firstName: "J", lastName: "Smith"}]},
        {id: 'C', title: "Completely Different Topic Here", DOI: "", date: "2021", creators: [{firstName: "X", lastName: "Other"}]}
    ];
    var blocks = buildBlocks(items);
    var pairs = getCandidatePairs(blocks);

    // Should have pair A-B (deduplicated across multiple shared blocks)
    var hasAB = false;
    for (var i = 0; i < pairs.length; i++) {
        if ((pairs[i][0] === 'A' && pairs[i][1] === 'B') ||
            (pairs[i][0] === 'B' && pairs[i][1] === 'A')) {
            hasAB = true;
            break;
        }
    }
    assertBool("getCandidatePairs: A-B pair exists", hasAB, true);

    // Count how many times A-B appears — should be exactly 1
    var countAB = 0;
    for (var j = 0; j < pairs.length; j++) {
        if ((pairs[j][0] === 'A' && pairs[j][1] === 'B') ||
            (pairs[j][0] === 'B' && pairs[j][1] === 'A')) {
            countAB++;
        }
    }
    assert("getCandidatePairs: A-B deduplicated (appears once)", countAB, 1);

    // C should not be paired with A or B (different blocks)
    var hasCpair = false;
    for (var k = 0; k < pairs.length; k++) {
        if (pairs[k][0] === 'C' || pairs[k][1] === 'C') {
            hasCpair = true;
            break;
        }
    }
    assertBool("getCandidatePairs: C not paired with A or B", hasCpair, false);
})();

// Dedup with numeric IDs
(function () {
    var blocks = new Map();
    blocks.set('key1', new Set([1, 2, 3]));
    blocks.set('key2', new Set([2, 3]));
    var pairs = getCandidatePairs(blocks);

    // Pairs from key1: (1,2), (1,3), (2,3); from key2: (2,3) — already seen
    assert("getCandidatePairs numeric: 3 unique pairs", pairs.length, 3);
})();

// Empty blocks
(function () {
    var blocks = new Map();
    var pairs = getCandidatePairs(blocks);
    assert("getCandidatePairs: empty blocks -> empty pairs", pairs.length, 0);
})();

// Singleton blocks produce no pairs
(function () {
    var blocks = new Map();
    blocks.set('key1', new Set([1]));
    blocks.set('key2', new Set([2]));
    var pairs = getCandidatePairs(blocks);
    assert("getCandidatePairs: singleton blocks -> no pairs", pairs.length, 0);
})();

// =====================================================================
// Summary
// =====================================================================
console.log("\n========================================");
console.log("Blocker tests: " + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
