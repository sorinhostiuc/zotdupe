/**
 * ZotDupe Composite Scorer
 *
 * Combines layer scores (1-7) into a single composite
 * duplicate-confidence score and classifies the result.
 *
 * Layers:
 *   1 - DOI / identifier exact match
 *   2 - Title similarity
 *   3 - Author similarity
 *   4 - Legal fingerprint match
 *   5 - URL / attachment similarity
 *   6 - Preprint-published detection
 *   7 - Translation detection
 */

if (typeof ZotDupe === 'undefined') var ZotDupe = {};
if (!ZotDupe.Scorer) ZotDupe.Scorer = {};

/**
 * Threshold name to numeric minimum mapping.
 */
ZotDupe.Scorer._thresholds = {
    strict:   0.90,
    balanced: 0.75,
    relaxed:  0.60
};

/**
 * Return the numeric minimum score for a named threshold.
 * @param {string} threshold - "strict", "balanced", or "relaxed"
 * @returns {number}
 */
ZotDupe.Scorer.getThresholdValue = function (threshold) {
    var val = ZotDupe.Scorer._thresholds[threshold];
    if (val === undefined) {
        throw new Error('Unknown threshold: ' + threshold);
    }
    return val;
};

/**
 * Compute the weighted combination of layers 2, 3, and 5.
 * Null layers are excluded; weights are re-normalized over
 * the layers that are present.
 *
 * @param {number|null} layer2 - title similarity
 * @param {number|null} layer3 - author similarity
 * @param {number|null} layer5 - URL/attachment similarity
 * @param {number|null} layer6 - preprint detection
 * @returns {number} combined score, or 0 if all are null
 */
ZotDupe.Scorer._combinedScore = function (layer2, layer3, layer5, layer6) {
    var weights = { layer2: 0.50, layer3: 0.25, layer5: 0.15, layer6: 0.10 };
    var layers  = { layer2: layer2, layer3: layer3, layer5: layer5, layer6: layer6 };

    var sum = 0;
    var wSum = 0;
    var keys = ['layer2', 'layer3', 'layer5', 'layer6'];
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (layers[k] !== null && layers[k] !== undefined) {
            sum  += layers[k] * weights[k];
            wSum += weights[k];
        }
    }
    return wSum > 0 ? sum / wSum : 0;
};

/**
 * Compute a single composite score from individual layer scores.
 *
 * @param {Object} layerScores - keys layer1..layer7, values 0.0-1.0 or null
 * @returns {number} composite score 0.0-1.0
 */
ZotDupe.Scorer.computeScore = function (layerScores) {
    var s = layerScores || {};

    var l1 = (s.layer1 !== null && s.layer1 !== undefined) ? s.layer1 : null;
    var l2 = (s.layer2 !== null && s.layer2 !== undefined) ? s.layer2 : null;
    var l3 = (s.layer3 !== null && s.layer3 !== undefined) ? s.layer3 : null;
    var l4 = (s.layer4 !== null && s.layer4 !== undefined) ? s.layer4 : null;
    var l5 = (s.layer5 !== null && s.layer5 !== undefined) ? s.layer5 : null;
    var l6 = (s.layer6 !== null && s.layer6 !== undefined) ? s.layer6 : null;
    var l7 = (s.layer7 !== null && s.layer7 !== undefined) ? s.layer7 : null;

    var candidates = [];

    // Strategy 1: DOI / identifier match (ceiling 0.95)
    if (l1 !== null) candidates.push(l1 * 0.95);

    // Strategy 4: Legal fingerprint (ceiling 0.90)
    if (l4 !== null) candidates.push(l4 * 0.90);

    // Combined score from title + author + URL + preprint (layers 2+3+5+6)
    var combined = ZotDupe.Scorer._combinedScore(l2, l3, l5, l6);
    if (l2 !== null || l3 !== null || l5 !== null || l6 !== null) {
        candidates.push(combined);
    }

    // Strategy 7: Translation detection (ceiling 0.60)
    if (l7 !== null) candidates.push(l7 * 0.60);

    if (candidates.length === 0) return 0;

    var max = candidates[0];
    for (var i = 1; i < candidates.length; i++) {
        if (candidates[i] > max) max = candidates[i];
    }
    return max;
};

/**
 * Classify a composite score against a named threshold.
 *
 * @param {number} score     - composite score 0.0-1.0
 * @param {string} threshold - "strict", "balanced", or "relaxed"
 * @returns {string} "none" | "possible" | "probable" | "sure"
 */
ZotDupe.Scorer.classify = function (score, threshold) {
    var min = ZotDupe.Scorer.getThresholdValue(threshold);
    if (score < min)  return 'none';
    if (score >= 0.95) return 'sure';
    if (score >= 0.80) return 'probable';
    return 'possible';
};
