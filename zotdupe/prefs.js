/* eslint-env mozilla/bootstrap-script */
/* global pref */

/**
 * ZotDupe — Default Preferences
 *
 * These defaults are loaded during startup via Services.scriptloader.
 * They use Zotero's pref() function to set initial values.
 */

// Matching threshold: "strict", "balanced", or "relaxed"
pref("extensions.zotdupe.threshold", "balanced");

// Enable legal-fingerprint matching (ISBN, DOI, PMID, etc.)
pref("extensions.zotdupe.enableLegalFingerprint", true);

// Enable preprint-to-published detection
pref("extensions.zotdupe.enablePreprintDetection", true);

// Enable translation detection (same work in different languages)
pref("extensions.zotdupe.enableTranslationDetection", false);

// Enable cross-type matching (e.g., conference paper vs journal article)
pref("extensions.zotdupe.enableCrossType", true);

// Enable MinHash for large-library approximate matching
pref("extensions.zotdupe.enableMinHash", false);

// Non-duplicate excluded pairs (JSON array of "keyA:keyB" strings)
pref("extensions.zotdupe.excludedPairs", "[]");
