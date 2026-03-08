/**
 * ZotDupe MinHash LSH Utilities
 *
 * Locality-Sensitive Hashing for approximate similarity search on large
 * item sets (>20k items). Uses MinHash signatures to estimate Jaccard
 * similarity, then LSH banding to efficiently find candidate duplicate pairs.
 */

if (typeof ZotDupe === 'undefined') var ZotDupe = {};
if (!ZotDupe.MinHash) ZotDupe.MinHash = {};

/**
 * Large Mersenne prime used as modulus in hash functions (2^31 - 1).
 * @const {number}
 */
var LARGE_PRIME = 2147483647;

/**
 * Generate k-character shingles (substrings) from text.
 * @param {string} text - Input text.
 * @param {number} [k=3] - Shingle length.
 * @returns {Set<string>} Set of shingle strings.
 */
ZotDupe.MinHash.shingles = function (text, k) {
    if (k === undefined || k === null) k = 3;
    var result = new Set();
    if (!text || text.length < k) return result;
    for (var i = 0; i <= text.length - k; i++) {
        result.add(text.substring(i, i + k));
    }
    return result;
};

/**
 * Simple 32-bit hash function for strings (FNV-1a variant).
 * @param {string} str - Input string.
 * @returns {number} 32-bit integer hash.
 */
ZotDupe.MinHash.hashCode = function (str) {
    if (!str) return 0;
    var hash = 0x811c9dc5; // FNV offset basis
    for (var i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        // Multiply by FNV prime 16777619, keep within 32 bits
        hash = (hash * 16777619) | 0;
    }
    // Return as positive integer
    return hash >>> 0;
};

/**
 * Generate a MinHash signature vector from a set of shingles.
 * Uses numHashes different hash functions derived from hashCode with
 * deterministic index-based seeds for reproducibility.
 *
 * hash_i(shingle) = (a_i * hashCode(shingle) + b_i) % LARGE_PRIME
 *
 * @param {Set<string>} shingleSet - Set of shingle strings.
 * @param {number} [numHashes=128] - Number of hash functions / signature length.
 * @returns {number[]} Array of numHashes minimum hash values.
 */
ZotDupe.MinHash.minhashSignature = function (shingleSet, numHashes) {
    if (numHashes === undefined || numHashes === null) numHashes = 128;

    // Initialise signature with maximum values
    var signature = new Array(numHashes);
    for (var i = 0; i < numHashes; i++) {
        signature[i] = Infinity;
    }

    if (!shingleSet || shingleSet.size === 0) return signature;

    // Pre-compute coefficients a and b for each hash function.
    // Use deterministic index-based seeding: a = 2*i + 1, b = 3*i + 7
    // a must be non-zero.
    var aCoeffs = new Array(numHashes);
    var bCoeffs = new Array(numHashes);
    for (var i = 0; i < numHashes; i++) {
        aCoeffs[i] = (2 * i + 1);
        bCoeffs[i] = (3 * i + 7);
    }

    var hashCode = ZotDupe.MinHash.hashCode;

    shingleSet.forEach(function (shingle) {
        var h = hashCode(shingle);
        for (var i = 0; i < numHashes; i++) {
            // Compute parameterised hash; use Math operations to stay in
            // safe integer range before taking modulus.
            var val = ((aCoeffs[i] * h + bCoeffs[i]) % LARGE_PRIME + LARGE_PRIME) % LARGE_PRIME;
            if (val < signature[i]) {
                signature[i] = val;
            }
        }
    });

    return signature;
};

/**
 * Estimate Jaccard similarity between two MinHash signatures by counting
 * the fraction of matching positions.
 * @param {number[]} sig1 - First signature.
 * @param {number[]} sig2 - Second signature.
 * @returns {number} Estimated similarity in [0, 1].
 */
ZotDupe.MinHash.signatureSimilarity = function (sig1, sig2) {
    if (!sig1 || !sig2 || sig1.length === 0) return 0;
    var len = Math.min(sig1.length, sig2.length);
    var matches = 0;
    for (var i = 0; i < len; i++) {
        if (sig1[i] === sig2[i]) matches++;
    }
    return matches / len;
};

/**
 * Split a MinHash signature into bands and hash each band to produce
 * an array of band-level hash values for LSH bucketing.
 *
 * @param {number[]} signature - MinHash signature vector.
 * @param {number} [numBands=16] - Number of bands.
 * @param {number} [rowsPerBand=8] - Number of rows per band (numBands * rowsPerBand should equal signature length).
 * @returns {number[]} Array of numBands hash values.
 */
ZotDupe.MinHash.lshBands = function (signature, numBands, rowsPerBand) {
    if (numBands === undefined || numBands === null) numBands = 16;
    if (rowsPerBand === undefined || rowsPerBand === null) rowsPerBand = 8;

    var hashCode = ZotDupe.MinHash.hashCode;
    var bands = new Array(numBands);

    for (var b = 0; b < numBands; b++) {
        var start = b * rowsPerBand;
        // Concatenate the values in this band into a string, then hash it
        var parts = [];
        for (var r = 0; r < rowsPerBand; r++) {
            parts.push(String(signature[start + r]));
        }
        bands[b] = hashCode(parts.join(','));
    }

    return bands;
};

/**
 * Build an LSH index over items and return candidate duplicate pairs.
 *
 * Each item is expected to have an `id` and a `normalizedTitle` property.
 * Items that share at least one LSH band bucket are returned as candidate
 * pairs for further (exact) similarity checking.
 *
 * @param {Array<{id: *, normalizedTitle: string}>} items - Array of items.
 * @param {number} [numBands=16] - Number of LSH bands.
 * @param {number} [rowsPerBand=8] - Rows per band.
 * @returns {Array<[*, *]>} Deduplicated array of [idA, idB] candidate pairs.
 */
ZotDupe.MinHash.lshCandidates = function (items, numBands, rowsPerBand) {
    if (numBands === undefined || numBands === null) numBands = 16;
    if (rowsPerBand === undefined || rowsPerBand === null) rowsPerBand = 8;

    if (!items || items.length === 0) return [];

    var shinglesFn = ZotDupe.MinHash.shingles;
    var minhashSig = ZotDupe.MinHash.minhashSignature;
    var lshBandsFn = ZotDupe.MinHash.lshBands;
    var numHashes = numBands * rowsPerBand;

    // Compute signatures and bands for each item
    var itemBands = []; // array of { id, bands }
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var sh = shinglesFn(item.normalizedTitle || '');
        var sig = minhashSig(sh, numHashes);
        var bands = lshBandsFn(sig, numBands, rowsPerBand);
        itemBands.push({ id: item.id, bands: bands, index: i });
    }

    // Build buckets: for each band index, map band hash -> list of item indices
    var seen = {}; // deduplicate candidate pairs using "idA,idB" keys
    for (var b = 0; b < numBands; b++) {
        var buckets = {};
        for (var j = 0; j < itemBands.length; j++) {
            var bandHash = itemBands[j].bands[b];
            if (!buckets[bandHash]) {
                buckets[bandHash] = [];
            }
            buckets[bandHash].push(j);
        }
        // All pairs within a bucket are candidates
        var keys = Object.keys(buckets);
        for (var k = 0; k < keys.length; k++) {
            var bucket = buckets[keys[k]];
            if (bucket.length < 2) continue;
            for (var p = 0; p < bucket.length; p++) {
                for (var q = p + 1; q < bucket.length; q++) {
                    var idA = itemBands[bucket[p]].id;
                    var idB = itemBands[bucket[q]].id;
                    // Canonical ordering for deduplication
                    var pairKey = idA < idB ? idA + ',' + idB : idB + ',' + idA;
                    seen[pairKey] = idA < idB ? [idA, idB] : [idB, idA];
                }
            }
        }
    }

    // Collect deduplicated pairs
    var result = [];
    var pairKeys = Object.keys(seen);
    for (var m = 0; m < pairKeys.length; m++) {
        result.push(seen[pairKeys[m]]);
    }
    return result;
};
