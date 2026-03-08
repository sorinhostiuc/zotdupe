/**
 * ZotDupe Main Orchestrator
 *
 * Ties all modules together: scanning, scoring, clustering, merging,
 * and CSV export. This is the entry point for duplicate detection
 * in Zotero 7+.
 *
 * Dependencies (loaded before this file):
 *   - ZotDupe.Normalize   (utils/normalize.js)
 *   - ZotDupe.LegalFingerprint (legal-fingerprint.js)
 *   - ZotDupe.Blocker      (blocker.js)
 *   - ZotDupe.MinHash      (utils/minhash.js)
 *   - ZotDupe.Scanner      (scanner.js)
 *   - ZotDupe.Scorer       (scorer.js)
 *   - ZotDupe.Canonical    (canonical.js)
 *   - ZotDupe.Merger       (merger.js)
 */

if (typeof ZotDupe === 'undefined') var ZotDupe = {};

// ============================================================
// extractFromExtra — pull structured values from Extra field
// ============================================================

/**
 * Extract a keyed value from the Zotero Extra field.
 * Handles lines like "PMID: 12345" or "PMCID: PMC1234567".
 *
 * @param {string} extra - Content of the Extra field
 * @param {string} key   - Key to look for (e.g. "PMID", "PMCID")
 * @returns {string} The value, or empty string if not found
 */
function extractFromExtra(extra, key) {
    if (!extra || !key) return '';
    var lines = String(extra).split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        // Match "KEY: value" or "KEY:value" (case-insensitive key match)
        var re = new RegExp('^' + key + '\\s*:\\s*(.+)$', 'i');
        var m = line.match(re);
        if (m) return m[1].trim();
    }
    return '';
}

ZotDupe.extractFromExtra = extractFromExtra;

// ============================================================
// itemToPlain — convert a live Zotero item to a plain object
// ============================================================

/**
 * Convert a Zotero item object to a plain object for the engine.
 * This function calls Zotero API methods; it cannot run outside Zotero.
 *
 * @param {Zotero.Item} zoteroItem - A live Zotero item
 * @returns {object} Plain object suitable for scanner/scorer/blocker
 */
ZotDupe.itemToPlain = function (zoteroItem) {
    var extra = zoteroItem.getField('extra');
    var plain = {
        id: zoteroItem.id,
        key: zoteroItem.key,
        itemType: Zotero.ItemTypes.getName(zoteroItem.itemTypeID),
        title: zoteroItem.getField('title'),
        DOI: zoteroItem.getField('DOI'),
        ISBN: zoteroItem.getField('ISBN'),
        PMID: extractFromExtra(extra, 'PMID'),
        PMCID: extractFromExtra(extra, 'PMCID'),
        date: zoteroItem.getField('date'),
        url: zoteroItem.getField('url'),
        language: zoteroItem.getField('language'),
        publicationTitle: zoteroItem.getField('publicationTitle'),
        extra: extra,
        creators: zoteroItem.getCreators().map(function (c) {
            return { firstName: c.firstName, lastName: c.lastName };
        }),
        tags: zoteroItem.getTags(),
        collections: zoteroItem.getCollections(),
        hasPDF: zoteroItem.getAttachments().some(function (aid) {
            var a = Zotero.Items.get(aid);
            return a && a.attachmentContentType === 'application/pdf';
        }),
        dateAdded: zoteroItem.dateAdded
    };

    // Normalize title for MinHash / blocker use
    if (typeof ZotDupe.Normalize !== 'undefined' && ZotDupe.Normalize.normalizeTitle) {
        plain.normalizedTitle = ZotDupe.Normalize.normalizeTitle(plain.title);
    }

    return plain;
};

// ============================================================
// Union-Find for clustering
// ============================================================

/**
 * Cluster duplicate pairs using Union-Find with path compression.
 *
 * @param {Array<{idA: *, idB: *, score: number, matchType: string}>} pairs
 * @returns {Array<{ids: Array, score: number, matchType: string}>}
 */
ZotDupe.clusterPairs = function (pairs) {
    if (!pairs || pairs.length === 0) return [];

    var parent = {};
    var rank = {};

    function find(x) {
        var key = String(x);
        if (!(key in parent)) {
            parent[key] = key;
            rank[key] = 0;
        }
        if (parent[key] !== key) {
            parent[key] = find(parent[key]); // path compression
        }
        return parent[key];
    }

    function union(a, b) {
        var ra = find(a);
        var rb = find(b);
        if (ra === rb) return;
        // Union by rank
        if (rank[ra] < rank[rb]) {
            parent[ra] = rb;
        } else if (rank[ra] > rank[rb]) {
            parent[rb] = ra;
        } else {
            parent[rb] = ra;
            rank[ra]++;
        }
    }

    // Track the best (highest-scoring) pair for each eventual cluster
    var pairInfo = {}; // root -> { score, matchType }

    for (var i = 0; i < pairs.length; i++) {
        var p = pairs[i];
        union(p.idA, p.idB);
    }

    // After all unions, gather cluster memberships
    var clusters = {}; // root -> Set of ids
    var allIds = {};

    for (var j = 0; j < pairs.length; j++) {
        allIds[String(pairs[j].idA)] = pairs[j].idA;
        allIds[String(pairs[j].idB)] = pairs[j].idB;
    }

    for (var idKey in allIds) {
        if (!allIds.hasOwnProperty(idKey)) continue;
        var root = find(idKey);
        if (!clusters[root]) {
            clusters[root] = [];
        }
        clusters[root].push(allIds[idKey]);
    }

    // Track best score/matchType per cluster
    for (var k = 0; k < pairs.length; k++) {
        var pp = pairs[k];
        var root2 = find(pp.idA);
        if (!pairInfo[root2] || pp.score > pairInfo[root2].score) {
            pairInfo[root2] = { score: pp.score, matchType: pp.matchType };
        }
    }

    // Build result array
    var result = [];
    for (var r in clusters) {
        if (!clusters.hasOwnProperty(r)) continue;
        var info = pairInfo[r] || { score: 0, matchType: '' };
        // Deduplicate ids
        var idSet = {};
        var uniqueIds = [];
        for (var m = 0; m < clusters[r].length; m++) {
            var id = clusters[r][m];
            var idStr = String(id);
            if (!idSet[idStr]) {
                idSet[idStr] = true;
                uniqueIds.push(id);
            }
        }
        result.push({
            ids: uniqueIds,
            score: info.score,
            matchType: info.matchType
        });
    }

    return result;
};

// ============================================================
// Excluded pairs (non-duplicate marking)
// ============================================================

/**
 * Normalize a pair of keys into a canonical string "keyA:keyB"
 * where keyA < keyB lexicographically.
 *
 * @param {string} keyA
 * @param {string} keyB
 * @returns {string}
 */
function _sortedPairKey(keyA, keyB) {
    var a = String(keyA);
    var b = String(keyB);
    return a < b ? a + ':' + b : b + ':' + a;
}

/**
 * Load excluded pairs from Zotero preferences.
 * Returns an array of "keyA:keyB" strings.
 *
 * @returns {Array<string>}
 */
function _loadExcludedPairs() {
    try {
        var json = Zotero.Prefs.get('extensions.zotdupe.excludedPairs', true);
        if (json) return JSON.parse(json);
    } catch (e) {
        // ignore parse errors
    }
    return [];
}

/**
 * Save excluded pairs to Zotero preferences.
 *
 * @param {Array<string>} pairs
 */
function _saveExcludedPairs(pairs) {
    Zotero.Prefs.set('extensions.zotdupe.excludedPairs', JSON.stringify(pairs), true);
}

/**
 * Mark a pair of items as non-duplicates.
 *
 * @param {string} itemKeyA - Zotero item key
 * @param {string} itemKeyB - Zotero item key
 */
ZotDupe.markNonDuplicate = function (itemKeyA, itemKeyB) {
    var pairKey = _sortedPairKey(itemKeyA, itemKeyB);
    var excluded = _loadExcludedPairs();
    if (excluded.indexOf(pairKey) === -1) {
        excluded.push(pairKey);
        _saveExcludedPairs(excluded);
    }
};

/**
 * Check if a pair is excluded (marked as non-duplicate).
 *
 * @param {string} keyA
 * @param {string} keyB
 * @returns {boolean}
 */
ZotDupe.isExcludedPair = function (keyA, keyB) {
    var pairKey = _sortedPairKey(keyA, keyB);
    var excluded = _loadExcludedPairs();
    return excluded.indexOf(pairKey) !== -1;
};

// Expose helper for testability without Zotero prefs
ZotDupe._sortedPairKey = _sortedPairKey;

/**
 * Pure-logic version of isExcludedPair that takes a list directly.
 * Used for testing without Zotero prefs.
 *
 * @param {string} keyA
 * @param {string} keyB
 * @param {Array<string>} excludedList
 * @returns {boolean}
 */
ZotDupe.isExcludedPairIn = function (keyA, keyB, excludedList) {
    var pairKey = _sortedPairKey(keyA, keyB);
    return excludedList.indexOf(pairKey) !== -1;
};

// ============================================================
// scan — main duplicate detection scan
// ============================================================

/**
 * Main scan function. Orchestrates blocking, scanning, scoring,
 * clustering, and canonical selection.
 *
 * @param {object} options
 * @param {number} options.libraryID
 * @param {number} [options.collectionID]
 * @param {string} [options.threshold='balanced'] - 'strict'|'balanced'|'relaxed'
 * @param {boolean} [options.enableLegalFingerprint=true]
 * @param {boolean} [options.enablePreprintDetection=true]
 * @param {boolean} [options.enableTranslationDetection=true]
 * @param {boolean} [options.enableCrossType=true]
 * @param {boolean} [options.enableMinHash=false]
 * @param {function} [options.onProgress] - callback(stage, detail)
 * @returns {Promise<{clusters: Array, stats: object}>}
 */
ZotDupe.scan = async function (options) {
    var opts = options || {};
    var threshold = opts.threshold || 'balanced';
    var startTime = Date.now();
    var progress = opts.onProgress || function () {};

    // Step a: Get items
    progress('loading', 'Fetching items from library...');
    var zoteroItems;
    if (opts.collectionID) {
        var collection = Zotero.Collections.get(opts.collectionID);
        zoteroItems = collection.getChildItems();
    } else {
        zoteroItems = await Zotero.Items.getAll(opts.libraryID);
    }

    // Filter to regular items (no notes, attachments, annotations)
    zoteroItems = zoteroItems.filter(function (item) {
        return item.isRegularItem && item.isRegularItem();
    });

    progress('converting', 'Converting ' + zoteroItems.length + ' items...');

    // Step b: Convert to plain objects
    var plainItems = [];
    var itemMap = {}; // id -> zoteroItem for later use
    for (var i = 0; i < zoteroItems.length; i++) {
        var plain = ZotDupe.itemToPlain(zoteroItems[i]);
        plainItems.push(plain);
        itemMap[plain.id] = zoteroItems[i];
    }

    // Build a lookup by id for plain items
    var plainById = {};
    for (var pi = 0; pi < plainItems.length; pi++) {
        plainById[plainItems[pi].id] = plainItems[pi];
    }

    // Step c: Build blocking index
    progress('blocking', 'Building blocking index...');
    var blocks = ZotDupe.Blocker.buildBlocks(plainItems);

    // Step d: Get candidate pairs from blocking
    var candidatePairs = ZotDupe.Blocker.getCandidatePairs(blocks);

    // Step d2: If MinHash enabled, add LSH candidates
    if (opts.enableMinHash && ZotDupe.MinHash) {
        progress('minhash', 'Computing MinHash LSH candidates...');
        var lshPairs = ZotDupe.MinHash.lshCandidates(plainItems);
        // Merge LSH pairs into candidate set (deduplicate)
        var seen = {};
        for (var cp = 0; cp < candidatePairs.length; cp++) {
            var a = candidatePairs[cp][0];
            var b = candidatePairs[cp][1];
            var pk = String(a < b ? a : b) + ':' + String(a < b ? b : a);
            seen[pk] = true;
        }
        for (var lp = 0; lp < lshPairs.length; lp++) {
            var la = lshPairs[lp][0];
            var lb = lshPairs[lp][1];
            var lpk = String(la < lb ? la : lb) + ':' + String(la < lb ? lb : la);
            if (!seen[lpk]) {
                seen[lpk] = true;
                candidatePairs.push(lshPairs[lp]);
            }
        }
    }

    // Step e-f: Scan and score each pair
    progress('scanning', 'Scanning ' + candidatePairs.length + ' candidate pairs...');
    var thresholdValue = ZotDupe.Scorer.getThresholdValue(threshold);
    var scoredPairs = [];

    for (var s = 0; s < candidatePairs.length; s++) {
        var idA = candidatePairs[s][0];
        var idB = candidatePairs[s][1];
        var itemA = plainById[idA];
        var itemB = plainById[idB];
        if (!itemA || !itemB) continue;

        // Scan
        var scanResult = ZotDupe.Scanner.scanPair(itemA, itemB, {
            enableLegalFingerprint: opts.enableLegalFingerprint,
            enablePreprintDetection: opts.enablePreprintDetection,
            enableTranslationDetection: opts.enableTranslationDetection,
            enableCrossType: opts.enableCrossType
        });

        // Score
        var score = ZotDupe.Scorer.computeScore(scanResult.scores);

        // Step g: Filter by threshold
        if (score < thresholdValue) continue;

        // Step h: Filter excluded pairs
        var keyA = itemA.key;
        var keyB = itemB.key;
        if (keyA && keyB && ZotDupe.isExcludedPair(keyA, keyB)) continue;

        scoredPairs.push({
            idA: idA,
            idB: idB,
            score: score,
            matchType: scanResult.matchType
        });

        // Progress every 500 pairs
        if (s % 500 === 0 && s > 0) {
            progress('scanning', 'Scanned ' + s + ' / ' + candidatePairs.length + ' pairs...');
        }
    }

    // Step i: Cluster
    progress('clustering', 'Clustering ' + scoredPairs.length + ' duplicate pairs...');
    var clusters = ZotDupe.clusterPairs(scoredPairs);

    // Step j: Select canonical for each cluster, classify
    for (var ci = 0; ci < clusters.length; ci++) {
        var cluster = clusters[ci];
        var clusterItems = [];
        for (var cj = 0; cj < cluster.ids.length; cj++) {
            var cid = cluster.ids[cj];
            if (plainById[cid]) clusterItems.push(plainById[cid]);
        }
        cluster.canonicalId = ZotDupe.Canonical.selectCanonical(clusterItems);
        cluster.classification = ZotDupe.Scorer.classify(cluster.score, threshold);
    }

    // Step k: Sort by score descending
    clusters.sort(function (a, b) { return b.score - a.score; });

    // Stats
    var sureClusters = 0;
    var probableClusters = 0;
    var possibleClusters = 0;
    for (var si = 0; si < clusters.length; si++) {
        var cls = clusters[si].classification;
        if (cls === 'sure') sureClusters++;
        else if (cls === 'probable') probableClusters++;
        else if (cls === 'possible') possibleClusters++;
    }

    var stats = {
        itemsScanned: plainItems.length,
        totalClusters: clusters.length,
        sureClusters: sureClusters,
        probableClusters: probableClusters,
        possibleClusters: possibleClusters,
        scanTimeMs: Date.now() - startTime
    };

    progress('done', 'Scan complete.');

    return { clusters: clusters, stats: stats };
};

// ============================================================
// mergeCluster — execute merge for a single cluster
// ============================================================

/**
 * Merge items in a cluster, keeping the canonical item.
 *
 * @param {object} cluster - { ids, canonicalId, ... }
 * @param {number} canonicalId - ID of the item to keep
 * @param {object} zoteroItems - Map of id -> Zotero.Item
 * @returns {Promise<object>} Merge result
 */
ZotDupe.mergeCluster = async function (cluster, canonicalId, zoteroItems) {
    var masterItem = zoteroItems[canonicalId];
    if (!masterItem) {
        throw new Error('Canonical item not found: ' + canonicalId);
    }

    var duplicateItems = [];
    for (var i = 0; i < cluster.ids.length; i++) {
        var id = cluster.ids[i];
        if (id !== canonicalId && zoteroItems[id]) {
            duplicateItems.push(zoteroItems[id]);
        }
    }

    if (duplicateItems.length === 0) {
        return { merged: false, reason: 'No duplicates to merge' };
    }

    // Cross-type: change duplicate types to match canonical if needed
    var masterType = Zotero.ItemTypes.getName(masterItem.itemTypeID);
    for (var j = 0; j < duplicateItems.length; j++) {
        var dupItem = duplicateItems[j];
        var dupType = Zotero.ItemTypes.getName(dupItem.itemTypeID);
        if (dupType !== masterType) {
            // Preserve lost fields in Extra before type change
            var dupPlain = ZotDupe.itemToPlain(dupItem);
            if (ZotDupe.Merger && ZotDupe.Merger.prepareCrossTypeMerge) {
                var mergeInfo = ZotDupe.Merger.prepareCrossTypeMerge(dupPlain, masterType);
                if (mergeInfo && mergeInfo.extraAppend) {
                    var currentExtra = dupItem.getField('extra') || '';
                    dupItem.setField('extra', currentExtra + '\n' + mergeInfo.extraAppend);
                }
            }
            dupItem.itemTypeID = Zotero.ItemTypes.getID(masterType);
            await dupItem.saveTx();
        }
    }

    // Execute merge inside a transaction
    var result = await Zotero.DB.executeTransaction(async function () {
        return Zotero.Items.merge(masterItem, duplicateItems);
    });

    return { merged: true, result: result };
};

// ============================================================
// mergeAllSure — auto-merge all "sure" clusters
// ============================================================

/**
 * Merge all clusters classified as "sure".
 *
 * @param {Array} clusters - Array of cluster objects from scan
 * @param {object} zoteroItems - Map of id -> Zotero.Item
 * @returns {Promise<number>} Count of merged clusters
 */
ZotDupe.mergeAllSure = async function (clusters, zoteroItems) {
    var mergedCount = 0;
    for (var i = 0; i < clusters.length; i++) {
        var cluster = clusters[i];
        if (cluster.classification === 'sure' && cluster.canonicalId) {
            try {
                await ZotDupe.mergeCluster(cluster, cluster.canonicalId, zoteroItems);
                mergedCount++;
            } catch (e) {
                // Log but continue with other clusters
                if (typeof Zotero !== 'undefined' && Zotero.debug) {
                    Zotero.debug('ZotDupe: merge failed for cluster: ' + e.message);
                }
            }
        }
    }
    return mergedCount;
};

// ============================================================
// exportCSV — generate CSV report
// ============================================================

/**
 * Generate a CSV string from clusters and an optional merge log.
 *
 * Columns: ClusterID, Score, Classification, MatchType, Action,
 *          ItemID, ItemType, Title, Authors, Year, DOI
 *
 * @param {Array} clusters - Array of cluster objects
 * @param {object} [mergeLog] - Map of clusterId -> action taken
 * @returns {string} CSV content
 */
ZotDupe.exportCSV = function (clusters, mergeLog) {
    var log = mergeLog || {};
    var lines = [];
    lines.push('ClusterID,Score,Classification,MatchType,Action,ItemID,ItemType,Title,Authors,Year,DOI');

    for (var i = 0; i < clusters.length; i++) {
        var cluster = clusters[i];
        var clusterId = i + 1;
        var classification = cluster.classification || '';
        var matchType = cluster.matchType || '';
        var score = cluster.score !== undefined ? cluster.score.toFixed(4) : '';
        var action = log[clusterId] || log[i] || '';

        // Items within the cluster
        var items = cluster.items || [];
        for (var j = 0; j < items.length; j++) {
            var item = items[j];
            var authors = '';
            if (item.creators && item.creators.length > 0) {
                var names = [];
                for (var c = 0; c < item.creators.length; c++) {
                    var cr = item.creators[c];
                    names.push((cr.lastName || '') + ' ' + (cr.firstName || ''));
                }
                authors = names.join('; ');
            }
            var year = '';
            if (item.date) {
                var ym = String(item.date).match(/(\d{4})/);
                if (ym) year = ym[1];
            }

            lines.push([
                clusterId,
                score,
                _csvEscape(classification),
                _csvEscape(matchType),
                _csvEscape(action),
                item.id || '',
                _csvEscape(item.itemType || ''),
                _csvEscape(item.title || ''),
                _csvEscape(authors),
                year,
                _csvEscape(item.DOI || '')
            ].join(','));
        }
    }

    return lines.join('\n');
};

/**
 * Escape a value for CSV (wrap in quotes if it contains comma, quote, or newline).
 * @param {string} val
 * @returns {string}
 */
function _csvEscape(val) {
    var s = String(val);
    if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

ZotDupe._csvEscape = _csvEscape;
