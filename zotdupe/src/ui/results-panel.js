/**
 * ZotDupe Results Panel — UI logic
 *
 * Displays detected duplicate clusters, allows filtering, searching,
 * canonical selection via radio buttons, per-cluster merge / non-duplicate
 * actions, and batch "auto-merge all sure" functionality.
 *
 * Receives data through window.arguments[0]:
 *   { clusters, stats, zoteroItems }
 *
 * clusters[i] = {
 *     ids:           [itemID, ...],
 *     items:         [plainItem, ...],
 *     score:         0.0–1.0,
 *     classification:"sure" | "probable" | "possible",
 *     matchType:     string,
 *     canonicalId:   itemID
 * }
 */

/* globals ZotDupe, Zotero */

var ZotDupeResults = {

    // ── State ──────────────────────────────────────────────────
    clusters: [],
    stats: {},
    zoteroItems: {},
    resolvedCount: 0,
    totalCount: 0,
    currentFilter: 'all',
    searchQuery: '',
    resolvedSet: new Set(),   // indices of resolved clusters

    // ── Emoji map for item types ──────────────────────────────
    TYPE_ICONS: {
        journalArticle:  '\uD83D\uDCF0',   // newspaper
        book:            '\uD83D\uDCD5',   // closed book
        bookSection:     '\uD83D\uDCD6',   // open book
        conferencePaper: '\uD83C\uDFE4',   // building
        thesis:          '\uD83C\uDF93',   // graduation cap
        report:          '\uD83D\uDCCB',   // clipboard
        webpage:         '\uD83C\uDF10',   // globe
        patent:          '\u2696\uFE0F',   // balance scale
        statute:         '\u2696\uFE0F',
        case:            '\u2696\uFE0F',
        bill:            '\u2696\uFE0F',
        hearing:         '\u2696\uFE0F',
        letter:          '\u2709\uFE0F',   // envelope
        preprint:        '\uD83D\uDCC4',   // page facing up
        manuscript:      '\uD83D\uDCDC',   // scroll
        presentation:    '\uD83D\uDCCA',   // bar chart
        default:         '\uD83D\uDCC4'    // page facing up
    },

    // ===========================================================
    // init — entry point, called on window load
    // ===========================================================
    init: function () {
        try {
            var args = (window.arguments && window.arguments[0]) || {};
            this.clusters    = args.clusters    || [];
            this.stats       = args.stats       || {};
            this.zoteroItems = args.zoteroItems  || {};
            this.totalCount  = this.clusters.length;
            this.resolvedCount = 0;
            this.resolvedSet = new Set();
            this.currentFilter = 'all';
            this.searchQuery = '';

            this.renderStats(this.stats);
            this.renderFilterCounts();
            this.renderClusters(this.clusters, 'all');
            this.updateBottomBar();
        } catch (e) {
            if (typeof Components !== 'undefined') {
                Components.utils.reportError('ZotDupeResults.init: ' + e);
            }
        }
    },

    // ===========================================================
    // renderStats — update the five stat cards
    // ===========================================================
    renderStats: function (stats) {
        var scanned  = stats.itemsScanned || 0;
        var clusters = this.clusters.length;
        var sure     = 0;
        var probable = 0;
        var possible = 0;
        for (var i = 0; i < this.clusters.length; i++) {
            var cl = this.clusters[i].classification;
            if (cl === 'sure')          sure++;
            else if (cl === 'probable') probable++;
            else                        possible++;
        }

        this._setText('stat-scanned',  scanned);
        this._setText('stat-clusters', clusters);
        this._setText('stat-sure',     sure);
        this._setText('stat-probable', probable);
        this._setText('stat-possible', possible);
    },

    // ===========================================================
    // renderFilterCounts — update chip counters
    // ===========================================================
    renderFilterCounts: function () {
        var counts = { all: 0, sure: 0, probable: 0, possible: 0 };
        for (var i = 0; i < this.clusters.length; i++) {
            if (this.resolvedSet.has(i)) continue;
            counts.all++;
            var cl = this.clusters[i].classification;
            if (counts[cl] !== undefined) counts[cl]++;
        }
        document.getElementById('chip-all').textContent      = counts.all;
        document.getElementById('chip-sure').textContent     = counts.sure;
        document.getElementById('chip-probable').textContent = counts.probable;
        document.getElementById('chip-possible').textContent = counts.possible;
        document.getElementById('auto-merge-count').textContent = counts.sure;
    },

    // ===========================================================
    // renderClusters — build visible cluster cards
    // ===========================================================
    renderClusters: function (clusters, filter) {
        var container = document.getElementById('zotdupe-cluster-list');
        container.innerHTML = '';

        var query = this.searchQuery.toLowerCase().trim();
        var rendered = 0;

        for (var i = 0; i < clusters.length; i++) {
            if (this.resolvedSet.has(i)) continue;
            if (filter !== 'all' && clusters[i].classification !== filter) continue;
            if (query && !this._clusterMatchesQuery(clusters[i], query)) continue;

            container.appendChild(this.renderClusterCard(clusters[i], i));
            rendered++;
        }

        if (rendered === 0) {
            var empty = document.createElement('div');
            empty.className = 'zotdupe-empty';
            empty.textContent = 'Niciun cluster corespunzător filtrelor.';
            container.appendChild(empty);
        }
    },

    // ===========================================================
    // renderClusterCard — build HTML for a single cluster
    // ===========================================================
    renderClusterCard: function (cluster, index) {
        var card = document.createElement('div');
        card.className = 'zotdupe-cluster-card ' + (cluster.classification || 'possible');
        card.id = 'cluster-card-' + index;

        // -- Header --
        var header = document.createElement('div');
        header.className = 'cluster-header';

        var label = document.createElement('span');
        label.className = 'cluster-label';
        label.textContent = 'Cluster #' + (index + 1);
        header.appendChild(label);

        var scoreBadge = document.createElement('span');
        scoreBadge.className = 'score-badge ' + (cluster.classification || 'possible');
        scoreBadge.textContent = (cluster.score != null)
            ? (cluster.score >= 1 ? '1.0' : cluster.score.toFixed(2).replace(/^0/, ''))
            : '?';
        header.appendChild(scoreBadge);

        if (cluster.matchType) {
            var mt = document.createElement('span');
            mt.className = 'match-type';
            mt.textContent = cluster.matchType;
            header.appendChild(mt);
        }

        var countBadge = document.createElement('span');
        countBadge.className = 'item-count-badge';
        countBadge.textContent = (cluster.items ? cluster.items.length : cluster.ids.length) + ' itemi';
        header.appendChild(countBadge);

        card.appendChild(header);

        // -- Item rows --
        var itemsDiv = document.createElement('div');
        itemsDiv.className = 'cluster-items';

        var items = cluster.items || [];
        var radioName = 'canonical-' + index;

        for (var j = 0; j < items.length; j++) {
            var item = items[j];
            var itemId = cluster.ids ? cluster.ids[j] : (item.id || j);
            var isCanonical = (itemId === cluster.canonicalId) ||
                              (String(itemId) === String(cluster.canonicalId));

            var row = document.createElement('div');
            row.className = 'cluster-item-row';

            // Radio
            var radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = radioName;
            radio.value = String(itemId);
            if (isCanonical) radio.checked = true;
            row.appendChild(radio);

            // Type icon
            var icon = document.createElement('span');
            icon.className = 'item-type-icon';
            var iType = item.itemType || 'default';
            icon.textContent = this.TYPE_ICONS[iType] || this.TYPE_ICONS['default'];
            row.appendChild(icon);

            // Title
            var title = document.createElement('span');
            title.className = 'item-title';
            title.textContent = item.title || '(fără titlu)';
            title.title = item.title || '';
            row.appendChild(title);

            // Authors
            var authors = document.createElement('span');
            authors.className = 'item-authors';
            authors.textContent = this._formatAuthors(item);
            authors.title = this._formatAuthors(item);
            row.appendChild(authors);

            // Year
            var year = document.createElement('span');
            year.className = 'item-year';
            year.textContent = this._extractYear(item.date) || '—';
            row.appendChild(year);

            // ItemType badge
            var typeBadge = document.createElement('span');
            typeBadge.className = 'item-type-badge';
            typeBadge.textContent = iType;
            row.appendChild(typeBadge);

            // DOI badge
            if (item.DOI) {
                var doiBadge = document.createElement('span');
                doiBadge.className = 'item-doi-badge';
                doiBadge.textContent = 'DOI';
                row.appendChild(doiBadge);
            }

            // PDF badge
            if (item.hasPDF || item.attachmentCount) {
                var pdfBadge = document.createElement('span');
                pdfBadge.className = 'item-pdf-badge';
                pdfBadge.textContent = 'PDF';
                row.appendChild(pdfBadge);
            }

            // Canonical recommendation label
            if (isCanonical) {
                var recLabel = document.createElement('span');
                recLabel.className = 'canonical-label';
                recLabel.textContent = '(RECOMANDAT)';
                row.appendChild(recLabel);
            }

            itemsDiv.appendChild(row);
        }

        card.appendChild(itemsDiv);

        // -- Action buttons --
        var actions = document.createElement('div');
        actions.className = 'cluster-actions';

        var btnMerge = document.createElement('button');
        btnMerge.className = 'btn-merge';
        btnMerge.textContent = 'Merge';
        btnMerge.onclick = function () { ZotDupeResults.onMerge(index); };
        actions.appendChild(btnMerge);

        var btnNonDup = document.createElement('button');
        btnNonDup.className = 'btn-non-dup';
        btnNonDup.textContent = 'Non-duplicate';
        btnNonDup.onclick = function () { ZotDupeResults.onNonDuplicate(index); };
        actions.appendChild(btnNonDup);

        var btnDetail = document.createElement('button');
        btnDetail.className = 'btn-detail';
        btnDetail.textContent = 'Detaliază diferențe';
        btnDetail.onclick = function () { ZotDupeResults.onDetail(index); };
        actions.appendChild(btnDetail);

        card.appendChild(actions);

        return card;
    },

    // ===========================================================
    // Filter / search handlers
    // ===========================================================
    onFilterChange: function (filter) {
        this.currentFilter = filter;

        // Update active chip styling
        var chips = document.querySelectorAll('.zotdupe-chip');
        for (var i = 0; i < chips.length; i++) {
            var chipFilter = chips[i].getAttribute('data-filter');
            if (chipFilter === filter) {
                chips[i].classList.add('active');
            } else {
                chips[i].classList.remove('active');
            }
        }

        this.renderClusters(this.clusters, filter);
    },

    onSearch: function (query) {
        this.searchQuery = query || '';
        this.renderClusters(this.clusters, this.currentFilter);
    },

    // ===========================================================
    // Merge action
    // ===========================================================
    onMerge: async function (clusterIndex) {
        var cluster = this.clusters[clusterIndex];
        if (!cluster) return;

        // Find the selected canonical item from the radio buttons
        var radios = document.querySelectorAll('input[name="canonical-' + clusterIndex + '"]');
        var selectedId = null;
        for (var i = 0; i < radios.length; i++) {
            if (radios[i].checked) {
                selectedId = radios[i].value;
                break;
            }
        }

        if (!selectedId) {
            // Fallback to cluster canonical
            selectedId = String(cluster.canonicalId);
        }

        try {
            if (typeof ZotDupe !== 'undefined' && ZotDupe.Merger && ZotDupe.Merger.mergeCluster) {
                await ZotDupe.Merger.mergeCluster(cluster, selectedId, this.zoteroItems);
            } else if (typeof ZotDupe !== 'undefined' && ZotDupe.mergeCluster) {
                await ZotDupe.mergeCluster(cluster, selectedId, this.zoteroItems);
            }
        } catch (e) {
            if (typeof Components !== 'undefined') {
                Components.utils.reportError('ZotDupeResults.onMerge error: ' + e);
            }
        }

        // Mark resolved and refresh
        this._resolveCluster(clusterIndex);
    },

    // ===========================================================
    // Non-duplicate action
    // ===========================================================
    onNonDuplicate: async function (clusterIndex) {
        var cluster = this.clusters[clusterIndex];
        if (!cluster) return;

        try {
            // Mark all pairs in this cluster as non-duplicate using item keys
            if (typeof ZotDupe !== 'undefined' && ZotDupe.markNonDuplicate) {
                var items = cluster.items || [];
                var keys = [];
                for (var k = 0; k < items.length; k++) {
                    if (items[k].key) keys.push(items[k].key);
                }
                for (var i = 0; i < keys.length; i++) {
                    for (var j = i + 1; j < keys.length; j++) {
                        ZotDupe.markNonDuplicate(keys[i], keys[j]);
                    }
                }
            }
        } catch (e) {
            if (typeof Components !== 'undefined') {
                Components.utils.reportError('ZotDupeResults.onNonDuplicate error: ' + e);
            }
        }

        this._resolveCluster(clusterIndex);
    },

    // ===========================================================
    // Detail — open merge-preview dialog
    // ===========================================================
    onDetail: function (clusterIndex) {
        var cluster = this.clusters[clusterIndex];
        if (!cluster) return;

        try {
            window.openDialog(
                'chrome://zotdupe/content/ui/merge-preview.xhtml',
                'zotdupe-merge-preview',
                'chrome,dialog,centerscreen,resizable=yes,width=720,height=560',
                { cluster: cluster, zoteroItems: this.zoteroItems, clusterIndex: clusterIndex }
            );
        } catch (e) {
            if (typeof Components !== 'undefined') {
                Components.utils.reportError('ZotDupeResults.onDetail error: ' + e);
            }
        }
    },

    // ===========================================================
    // Auto-merge all sure clusters
    // ===========================================================
    onAutoMergeAllSure: async function () {
        var btn = document.getElementById('btn-auto-merge');
        if (btn) btn.disabled = true;

        for (var i = 0; i < this.clusters.length; i++) {
            if (this.resolvedSet.has(i)) continue;
            if (this.clusters[i].classification !== 'sure') continue;

            try {
                var cluster = this.clusters[i];
                var canonicalId = String(cluster.canonicalId);
                if (typeof ZotDupe !== 'undefined' && ZotDupe.Merger && ZotDupe.Merger.mergeCluster) {
                    await ZotDupe.Merger.mergeCluster(cluster, canonicalId, this.zoteroItems);
                } else if (typeof ZotDupe !== 'undefined' && ZotDupe.mergeCluster) {
                    await ZotDupe.mergeCluster(cluster, canonicalId, this.zoteroItems);
                }
                this._resolveCluster(i);
            } catch (e) {
                if (typeof Components !== 'undefined') {
                    Components.utils.reportError('ZotDupeResults.onAutoMergeAllSure error on cluster ' + i + ': ' + e);
                }
            }
        }

        if (btn) btn.disabled = false;
    },

    // ===========================================================
    // Close — open report dialog, then close window
    // ===========================================================
    onClose: function () {
        try {
            window.openDialog(
                'chrome://zotdupe/content/ui/report-dialog.xhtml',
                'zotdupe-report',
                'chrome,dialog,centerscreen,modal,width=480,height=380',
                {
                    totalClusters: this.totalCount,
                    resolved: this.resolvedCount,
                    remaining: this.totalCount - this.resolvedCount,
                    stats: this.stats
                }
            );
        } catch (e) {
            // Report dialog may not exist yet — just close
        }
        window.close();
    },

    // ===========================================================
    // Internal helpers
    // ===========================================================

    /**
     * Mark a cluster as resolved: remove from view, update counts.
     */
    _resolveCluster: function (index) {
        this.resolvedSet.add(index);
        this.resolvedCount++;

        // Animate out the card
        var card = document.getElementById('cluster-card-' + index);
        if (card) {
            card.classList.add('resolved');
            var self = this;
            setTimeout(function () {
                if (card.parentNode) card.parentNode.removeChild(card);
                // Check if empty
                var container = document.getElementById('zotdupe-cluster-list');
                if (container && container.children.length === 0) {
                    self.renderClusters(self.clusters, self.currentFilter);
                }
            }, 350);
        }

        this.renderFilterCounts();
        this.updateBottomBar();
    },

    /**
     * Update the bottom bar resolved counter.
     */
    updateBottomBar: function () {
        var label = document.getElementById('zotdupe-resolved-label');
        if (label) {
            label.textContent = 'Clustere rezolvate: ' + this.resolvedCount + '/' + this.totalCount;
        }
    },

    /**
     * Check whether a cluster matches a search query (by title or author).
     */
    _clusterMatchesQuery: function (cluster, query) {
        var items = cluster.items || [];
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.title && item.title.toLowerCase().indexOf(query) !== -1) return true;
            var authStr = this._formatAuthors(item).toLowerCase();
            if (authStr.indexOf(query) !== -1) return true;
        }
        return false;
    },

    /**
     * Format authors string from a plain item object.
     */
    _formatAuthors: function (item) {
        if (!item) return '';
        if (item.firstCreator) return item.firstCreator;
        if (item.creators && item.creators.length > 0) {
            var names = [];
            for (var i = 0; i < Math.min(item.creators.length, 3); i++) {
                var c = item.creators[i];
                if (c.lastName) {
                    names.push(c.lastName + (c.firstName ? ' ' + c.firstName.charAt(0) + '.' : ''));
                } else if (c.name) {
                    names.push(c.name);
                }
            }
            var result = names.join(', ');
            if (item.creators.length > 3) result += ' et al.';
            return result;
        }
        return '';
    },

    /**
     * Extract a 4-digit year from a date string.
     */
    _extractYear: function (dateStr) {
        if (!dateStr) return '';
        var m = String(dateStr).match(/(\d{4})/);
        return m ? m[1] : '';
    },

    /**
     * Set text content for the number element inside a stat card.
     */
    _setText: function (cardId, value) {
        var card = document.getElementById(cardId);
        if (!card) return;
        var numEl = card.querySelector('.stat-number');
        if (numEl) numEl.textContent = String(value);
    }
};
