/**
 * Tests for ZotDupe Legal Fingerprinting
 *
 * Run with: node zotdupe/tests/test-legal-fingerprint.js
 */

// Bootstrap the ZotDupe namespace
var ZotDupe = {};

// Load the module under test (sets up ZotDupe.LegalFingerprint)
eval(require('fs').readFileSync(__dirname + '/../src/legal-fingerprint.js', 'utf8'));

var extractLegalFingerprint = ZotDupe.LegalFingerprint.extractLegalFingerprint;
var isLegalItem = ZotDupe.LegalFingerprint.isLegalItem;
var legalFingerprintKey = ZotDupe.LegalFingerprint.legalFingerprintKey;

var passed = 0;
var failed = 0;

function deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    var keysA = Object.keys(a).sort();
    var keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    for (var i = 0; i < keysA.length; i++) {
        if (keysA[i] !== keysB[i]) return false;
        if (a[keysA[i]] !== b[keysB[i]]) return false;
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

// ── Romanian legislation ──

console.log("\n--- extractLegalFingerprint: Romanian legislation ---");

assert(
    "Legea nr. 104/2003 privind manipularea cadavrelor",
    extractLegalFingerprint("Legea nr. 104/2003 privind manipularea cadavrelor"),
    {type: "LEGE", number: "104", year: "2003"}
);

assert(
    "Lege 104 din 25 aprilie 2003",
    extractLegalFingerprint("Lege 104 din 25 aprilie 2003"),
    {type: "LEGE", number: "104", year: "2003"}
);

assert(
    "Legea 123/2010",
    extractLegalFingerprint("Legea 123/2010"),
    {type: "LEGE", number: "123", year: "2010"}
);

assert(
    "OUG nr. 57/2019",
    extractLegalFingerprint("OUG nr. 57/2019"),
    {type: "OUG", number: "57", year: "2019"}
);

assert(
    "Ordonanta de urgenta nr. 57/2019",
    extractLegalFingerprint("Ordonanta de urgenta nr. 57/2019"),
    {type: "OUG", number: "57", year: "2019"}
);

assert(
    "Ordonanța de urgență nr. 57/2019 (with diacritics)",
    extractLegalFingerprint("Ordonanța de urgență nr. 57/2019"),
    {type: "OUG", number: "57", year: "2019"}
);

assert(
    "Hotararea Guvernului nr. 355/2007",
    extractLegalFingerprint("Hotărârea Guvernului nr. 355/2007"),
    {type: "HG", number: "355", year: "2007"}
);

assert(
    "HG nr. 355/2007",
    extractLegalFingerprint("HG nr. 355/2007"),
    {type: "HG", number: "355", year: "2007"}
);

assert(
    "Ordin nr. 1226/2012",
    extractLegalFingerprint("Ordin nr. 1226/2012"),
    {type: "ORDIN", number: "1226", year: "2012"}
);

assert(
    "Ordinul nr. 500/2020",
    extractLegalFingerprint("Ordinul nr. 500/2020"),
    {type: "ORDIN", number: "500", year: "2020"}
);

// ── EU legislation ──

console.log("\n--- extractLegalFingerprint: EU legislation ---");

assert(
    "Directiva 2006/54/CE",
    extractLegalFingerprint("Directiva 2006/54/CE"),
    {type: "DIRECTIVA", number: "2006/54", year: "2006"}
);

assert(
    "Directiva 2000/78/CE",
    extractLegalFingerprint("Directiva 2000/78/CE"),
    {type: "DIRECTIVA", number: "2000/78", year: "2000"}
);

assert(
    "Regulamentul (CE) nr. 561/2006",
    extractLegalFingerprint("Regulamentul (CE) nr. 561/2006"),
    {type: "REGULAMENT", number: "561", year: "2006"}
);

assert(
    "Regulamentul (UE) nr. 2016/679 (GDPR - new EU numbering format)",
    extractLegalFingerprint("Regulamentul (UE) nr. 2016/679"),
    {type: "REGULAMENT", number: "2016", year: "679"}
);

// ── Court decisions ──

console.log("\n--- extractLegalFingerprint: Court decisions ---");

assert(
    "Decizia nr. 405/2016",
    extractLegalFingerprint("Decizia nr. 405/2016"),
    {type: "DECIZIE", number: "405", year: "2016"}
);

assert(
    "Decizia nr. 100 din 2018",
    extractLegalFingerprint("Decizia nr. 100 din 2018"),
    {type: "DECIZIE", number: "100", year: "2018"}
);

// ── Non-legal ──

console.log("\n--- extractLegalFingerprint: Non-legal ---");

assert(
    "Machine learning in forensic anthropology",
    extractLegalFingerprint("Machine learning in forensic anthropology"),
    null
);

assert(
    "Empty string",
    extractLegalFingerprint(""),
    null
);

assert(
    "Null input",
    extractLegalFingerprint(null),
    null
);

assert(
    "A review of computational methods",
    extractLegalFingerprint("A review of computational methods"),
    null
);

// ── isLegalItem ──

console.log("\n--- isLegalItem ---");

assertBool(
    "statute itemType",
    isLegalItem({itemType: "statute", title: "Some statute"}),
    true
);

assertBool(
    "bill itemType",
    isLegalItem({itemType: "bill", title: "Some bill"}),
    true
);

assertBool(
    "hearing itemType",
    isLegalItem({itemType: "hearing", title: "Some hearing"}),
    true
);

assertBool(
    "regulation itemType",
    isLegalItem({itemType: "regulation", title: "Some regulation"}),
    true
);

assertBool(
    "case itemType",
    isLegalItem({itemType: "case", title: "Some case"}),
    true
);

assertBool(
    "webpage with legal title",
    isLegalItem({itemType: "webpage", title: "Legea nr. 104/2003"}),
    true
);

assertBool(
    "journalArticle with non-legal title",
    isLegalItem({itemType: "journalArticle", title: "A review of ML"}),
    false
);

assertBool(
    "null item",
    isLegalItem(null),
    false
);

// ── legalFingerprintKey ──

console.log("\n--- legalFingerprintKey ---");

assertBool(
    "LEGE key",
    legalFingerprintKey({type: "LEGE", number: "104", year: "2003"}),
    "LEGE:104:2003"
);

assertBool(
    "DIRECTIVA key",
    legalFingerprintKey({type: "DIRECTIVA", number: "2006/54", year: "2006"}),
    "DIRECTIVA:2006/54:2006"
);

assertBool(
    "OUG key",
    legalFingerprintKey({type: "OUG", number: "57", year: "2019"}),
    "OUG:57:2019"
);

// ── Summary ──

console.log("\n========================================");
console.log("Total: " + (passed + failed) + " | Passed: " + passed + " | Failed: " + failed);
console.log("========================================\n");

if (failed > 0) {
    process.exit(1);
}
